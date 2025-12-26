"""
Al-Ghazaly Auto Parts API - Offline-First Architecture
Backend: FastAPI + PostgreSQL + Redis + WebSockets
Designed for WatermelonDB sync on frontend
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, and_, or_
from sqlalchemy.orm import selectinload
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Set
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import json
import time
import asyncio

# Local imports
from database import get_db, init_db, close_db, async_session
from models import (
    User, UserSession, CarBrand, CarModel, ProductBrand, Category, 
    Product, Cart, CartItem, Order, OrderItem, Favorite, Comment, SyncLog,
    product_car_models
)
from cache import CacheService, PubSubService, get_redis, close_redis

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create the main app
app = FastAPI(title="Al-Ghazaly Auto Parts API", version="2.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}  # user_id -> websockets
        self.anonymous_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket, user_id: str = None):
        await websocket.accept()
        if user_id:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()
            self.active_connections[user_id].add(websocket)
        else:
            self.anonymous_connections.add(websocket)
    
    def disconnect(self, websocket: WebSocket, user_id: str = None):
        if user_id and user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        else:
            self.anonymous_connections.discard(websocket)
    
    async def send_to_user(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            for conn in self.active_connections[user_id]:
                try:
                    await conn.send_json(message)
                except:
                    pass
    
    async def broadcast(self, message: dict):
        for connections in self.active_connections.values():
            for conn in connections:
                try:
                    await conn.send_json(message)
                except:
                    pass
        for conn in self.anonymous_connections:
            try:
                await conn.send_json(message)
            except:
                pass

manager = ConnectionManager()

# ==================== Pydantic Schemas ====================

class UserCreate(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None

class CarBrandCreate(BaseModel):
    name: str
    name_ar: str
    logo: Optional[str] = None

class CarBrandResponse(BaseModel):
    id: str
    name: str
    name_ar: str
    logo: Optional[str]
    created_at: datetime
    updated_at: datetime

class CarModelVariantSchema(BaseModel):
    name: str
    name_ar: str
    engine: str
    engine_ar: str
    transmission: str
    transmission_ar: str
    fuel_type: str
    fuel_type_ar: str

class CarModelCreate(BaseModel):
    brand_id: str
    name: str
    name_ar: str
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    variants: List[CarModelVariantSchema] = []

class ProductBrandCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    logo: Optional[str] = None
    country_of_origin: Optional[str] = None
    country_of_origin_ar: Optional[str] = None

class CategoryCreate(BaseModel):
    name: str
    name_ar: str
    parent_id: Optional[str] = None
    icon: Optional[str] = None

class ProductCreate(BaseModel):
    name: str
    name_ar: str
    description: Optional[str] = None
    description_ar: Optional[str] = None
    price: float
    sku: str
    product_brand_id: Optional[str] = None
    category_id: Optional[str] = None
    image_url: Optional[str] = None
    images: List[str] = []
    car_model_ids: List[str] = []
    stock_quantity: int = 0
    hidden_status: bool = False

class CartItemAdd(BaseModel):
    product_id: str
    quantity: int = 1

class OrderCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    street_address: str
    city: str
    state: str
    country: str = "Egypt"
    delivery_instructions: Optional[str] = None
    payment_method: str = "cash_on_delivery"
    notes: Optional[str] = None

class CommentCreate(BaseModel):
    text: str
    rating: Optional[int] = None

class FavoriteAdd(BaseModel):
    product_id: str

# Sync schemas for WatermelonDB
class SyncPullRequest(BaseModel):
    last_pulled_at: Optional[int] = None  # Unix timestamp in ms
    tables: List[str] = []  # Which tables to pull

class SyncPushChanges(BaseModel):
    created: List[Dict[str, Any]] = []
    updated: List[Dict[str, Any]] = []
    deleted: List[str] = []

class SyncPushRequest(BaseModel):
    changes: Dict[str, SyncPushChanges]
    last_pulled_at: Optional[int] = None

# ==================== Helpers ====================

def get_timestamp_ms() -> int:
    """Get current timestamp in milliseconds for WatermelonDB"""
    return int(time.time() * 1000)

def model_to_dict(model) -> dict:
    """Convert SQLAlchemy model to dict"""
    if model is None:
        return None
    result = {}
    for column in model.__table__.columns:
        value = getattr(model, column.name)
        if isinstance(value, datetime):
            result[column.name] = value.isoformat()
        else:
            result[column.name] = value
    return result

async def log_sync_action(db: AsyncSession, table_name: str, record_id: str, action: str, user_id: str = None):
    """Log sync action for tracking changes"""
    sync_log = SyncLog(
        table_name=table_name,
        record_id=record_id,
        action=action,
        timestamp=get_timestamp_ms(),
        user_id=user_id
    )
    db.add(sync_log)

# ==================== Auth Helpers ====================

async def get_session_token(request: Request) -> Optional[str]:
    token = request.cookies.get("session_token")
    if token:
        return token
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None

async def get_current_user(request: Request, db: AsyncSession) -> Optional[User]:
    token = await get_session_token(request)
    if not token:
        return None
    
    result = await db.execute(
        select(UserSession).where(UserSession.session_token == token)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        return None
    
    if session.expires_at <= datetime.now(timezone.utc):
        return None
    
    result = await db.execute(
        select(User).where(User.id == session.user_id)
    )
    return result.scalar_one_or_none()

async def require_auth(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

# ==================== Auth Routes ====================

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Exchange session_id for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    async with httpx.AsyncClient() as client:
        try:
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session_id")
            user_data = auth_response.json()
        except Exception as e:
            logger.error(f"Auth API error: {e}")
            raise HTTPException(status_code=500, detail="Authentication service error")
    
    # Check if user exists
    result = await db.execute(
        select(User).where(User.email == user_data["email"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        user = User(
            email=user_data["email"],
            name=user_data["name"],
            picture=user_data.get("picture")
        )
        db.add(user)
        await db.flush()
        await log_sync_action(db, "users", user.id, "created")
    
    # Create session
    session = UserSession(
        user_id=user.id,
        session_token=user_data["session_token"],
        expires_at=datetime.now(timezone.utc) + timedelta(days=7)
    )
    db.add(session)
    await db.commit()
    
    response.set_cookie(
        key="session_token",
        value=session.session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    return {"user": model_to_dict(user), "session_token": session.session_token}

@api_router.get("/auth/me")
async def get_me(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return model_to_dict(user)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = await get_session_token(request)
    if token:
        await db.execute(delete(UserSession).where(UserSession.session_token == token))
        await db.commit()
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ==================== Car Brand Routes ====================

@api_router.get("/car-brands")
async def get_car_brands(db: AsyncSession = Depends(get_db)):
    # Try cache first
    cached = await CacheService.get_all_car_brands()
    if cached:
        return cached
    
    result = await db.execute(
        select(CarBrand).where(CarBrand.deleted_at == None).order_by(CarBrand.name)
    )
    brands = [model_to_dict(b) for b in result.scalars().all()]
    
    await CacheService.set_all_car_brands(brands)
    return brands

@api_router.post("/car-brands")
async def create_car_brand(brand: CarBrandCreate, db: AsyncSession = Depends(get_db)):
    db_brand = CarBrand(**brand.dict())
    db.add(db_brand)
    await db.flush()
    await log_sync_action(db, "car_brands", db_brand.id, "created")
    await db.commit()
    
    await CacheService.invalidate_car_brands()
    await manager.broadcast({"type": "sync", "tables": ["car_brands"]})
    
    return model_to_dict(db_brand)

@api_router.delete("/car-brands/{brand_id}")
async def delete_car_brand(brand_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CarBrand).where(CarBrand.id == brand_id))
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    
    brand.deleted_at = datetime.now(timezone.utc)
    await log_sync_action(db, "car_brands", brand_id, "deleted")
    await db.commit()
    
    await CacheService.invalidate_car_brands()
    await manager.broadcast({"type": "sync", "tables": ["car_brands"]})
    
    return {"message": "Deleted successfully"}

# ==================== Car Model Routes ====================

@api_router.get("/car-models")
async def get_car_models(brand_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    # Try cache if fetching all
    if not brand_id:
        cached = await CacheService.get_all_car_models()
        if cached:
            return cached
    
    query = select(CarModel).where(CarModel.deleted_at == None)
    if brand_id:
        query = query.where(CarModel.brand_id == brand_id)
    
    result = await db.execute(query.order_by(CarModel.name))
    models = [model_to_dict(m) for m in result.scalars().all()]
    
    if not brand_id:
        await CacheService.set_all_car_models(models)
    
    return models

@api_router.get("/car-models/{model_id}")
async def get_car_model_details(model_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CarModel).options(selectinload(CarModel.brand), selectinload(CarModel.products))
        .where(CarModel.id == model_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    
    model_dict = model_to_dict(model)
    model_dict["brand"] = model_to_dict(model.brand) if model.brand else None
    model_dict["compatible_products"] = [model_to_dict(p) for p in model.products if not p.deleted_at]
    model_dict["compatible_products_count"] = len(model_dict["compatible_products"])
    
    return model_dict

@api_router.post("/car-models")
async def create_car_model(model: CarModelCreate, db: AsyncSession = Depends(get_db)):
    model_data = model.dict()
    model_data["variants"] = [v.dict() if hasattr(v, 'dict') else v for v in model_data.get("variants", [])]
    
    db_model = CarModel(**model_data)
    db.add(db_model)
    await db.flush()
    await log_sync_action(db, "car_models", db_model.id, "created")
    await db.commit()
    
    await CacheService.invalidate_car_models()
    await manager.broadcast({"type": "sync", "tables": ["car_models"]})
    
    return model_to_dict(db_model)

@api_router.put("/car-models/{model_id}")
async def update_car_model(model_id: str, model_data: CarModelCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CarModel).where(CarModel.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    
    update_dict = model_data.dict()
    update_dict["variants"] = [v.dict() if hasattr(v, 'dict') else v for v in update_dict.get("variants", [])]
    
    for key, value in update_dict.items():
        setattr(model, key, value)
    
    await log_sync_action(db, "car_models", model_id, "updated")
    await db.commit()
    
    await CacheService.invalidate_car_models()
    await manager.broadcast({"type": "sync", "tables": ["car_models"]})
    
    return {"message": "Updated successfully"}

@api_router.delete("/car-models/{model_id}")
async def delete_car_model(model_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CarModel).where(CarModel.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    
    model.deleted_at = datetime.now(timezone.utc)
    await log_sync_action(db, "car_models", model_id, "deleted")
    await db.commit()
    
    await CacheService.invalidate_car_models()
    await manager.broadcast({"type": "sync", "tables": ["car_models"]})
    
    return {"message": "Deleted successfully"}

# ==================== Product Brand Routes ====================

@api_router.get("/product-brands")
async def get_product_brands(db: AsyncSession = Depends(get_db)):
    cached = await CacheService.get_all_product_brands()
    if cached:
        return cached
    
    result = await db.execute(
        select(ProductBrand).where(ProductBrand.deleted_at == None).order_by(ProductBrand.name)
    )
    brands = [model_to_dict(b) for b in result.scalars().all()]
    
    await CacheService.set_all_product_brands(brands)
    return brands

@api_router.post("/product-brands")
async def create_product_brand(brand: ProductBrandCreate, db: AsyncSession = Depends(get_db)):
    db_brand = ProductBrand(**brand.dict())
    db.add(db_brand)
    await db.flush()
    await log_sync_action(db, "product_brands", db_brand.id, "created")
    await db.commit()
    
    await CacheService.invalidate_product_brands()
    await manager.broadcast({"type": "sync", "tables": ["product_brands"]})
    
    return model_to_dict(db_brand)

@api_router.delete("/product-brands/{brand_id}")
async def delete_product_brand(brand_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProductBrand).where(ProductBrand.id == brand_id))
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    
    brand.deleted_at = datetime.now(timezone.utc)
    await log_sync_action(db, "product_brands", brand_id, "deleted")
    await db.commit()
    
    await CacheService.invalidate_product_brands()
    await manager.broadcast({"type": "sync", "tables": ["product_brands"]})
    
    return {"message": "Deleted successfully"}

# ==================== Category Routes ====================

@api_router.get("/categories")
async def get_categories(parent_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(Category).where(Category.deleted_at == None)
    if parent_id is None:
        query = query.where(Category.parent_id == None)
    else:
        query = query.where(Category.parent_id == parent_id)
    
    result = await db.execute(query.order_by(Category.sort_order, Category.name))
    return [model_to_dict(c) for c in result.scalars().all()]

@api_router.get("/categories/all")
async def get_all_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Category).where(Category.deleted_at == None).order_by(Category.sort_order, Category.name)
    )
    return [model_to_dict(c) for c in result.scalars().all()]

@api_router.get("/categories/tree")
async def get_categories_tree(db: AsyncSession = Depends(get_db)):
    cached = await CacheService.get_categories_tree()
    if cached:
        return cached
    
    result = await db.execute(
        select(Category).where(Category.deleted_at == None).order_by(Category.sort_order, Category.name)
    )
    all_categories = [model_to_dict(c) for c in result.scalars().all()]
    
    # Build tree
    categories_by_id = {cat["id"]: {**cat, "children": []} for cat in all_categories}
    root_categories = []
    
    for cat in all_categories:
        if cat.get("parent_id") and cat["parent_id"] in categories_by_id:
            categories_by_id[cat["parent_id"]]["children"].append(categories_by_id[cat["id"]])
        elif not cat.get("parent_id"):
            root_categories.append(categories_by_id[cat["id"]])
    
    await CacheService.set_categories_tree(root_categories)
    return root_categories

@api_router.post("/categories")
async def create_category(category: CategoryCreate, db: AsyncSession = Depends(get_db)):
    db_category = Category(**category.dict())
    db.add(db_category)
    await db.flush()
    await log_sync_action(db, "categories", db_category.id, "created")
    await db.commit()
    
    await CacheService.invalidate_categories()
    await manager.broadcast({"type": "sync", "tables": ["categories"]})
    
    return model_to_dict(db_category)

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    category.deleted_at = datetime.now(timezone.utc)
    await log_sync_action(db, "categories", category_id, "deleted")
    await db.commit()
    
    await CacheService.invalidate_categories()
    await manager.broadcast({"type": "sync", "tables": ["categories"]})
    
    return {"message": "Deleted successfully"}

# ==================== Product Routes ====================

@api_router.get("/products")
async def get_products(
    category_id: Optional[str] = None,
    product_brand_id: Optional[str] = None,
    car_model_id: Optional[str] = None,
    car_brand_id: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    skip: int = 0,
    limit: int = 50,
    include_hidden: bool = False,
    db: AsyncSession = Depends(get_db)
):
    query = select(Product).where(Product.deleted_at == None)
    
    if not include_hidden:
        query = query.where(or_(Product.hidden_status == False, Product.hidden_status == None))
    
    if category_id:
        # Get subcategories
        sub_result = await db.execute(
            select(Category.id).where(Category.parent_id == category_id)
        )
        subcategory_ids = [r[0] for r in sub_result.all()]
        category_ids = [category_id] + subcategory_ids
        query = query.where(Product.category_id.in_(category_ids))
    
    if product_brand_id:
        query = query.where(Product.product_brand_id == product_brand_id)
    
    if car_model_id:
        query = query.join(product_car_models).where(product_car_models.c.car_model_id == car_model_id)
    
    if car_brand_id:
        model_result = await db.execute(
            select(CarModel.id).where(CarModel.brand_id == car_brand_id)
        )
        model_ids = [r[0] for r in model_result.all()]
        if model_ids:
            query = query.join(product_car_models).where(product_car_models.c.car_model_id.in_(model_ids))
    
    if min_price is not None:
        query = query.where(Product.price >= min_price)
    if max_price is not None:
        query = query.where(Product.price <= max_price)
    
    # Get total count
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()
    
    # Get paginated results
    result = await db.execute(query.offset(skip).limit(limit).order_by(Product.created_at.desc()))
    products = [model_to_dict(p) for p in result.scalars().all()]
    
    # Get car_model_ids for each product
    for product in products:
        cm_result = await db.execute(
            select(product_car_models.c.car_model_id).where(product_car_models.c.product_id == product["id"])
        )
        product["car_model_ids"] = [r[0] for r in cm_result.all()]
    
    return {"products": products, "total": total}

@api_router.get("/products/search")
async def search_products(q: str = Query(..., min_length=1), limit: int = 20, db: AsyncSession = Depends(get_db)):
    search_pattern = f"%{q}%"
    
    # Search products
    result = await db.execute(
        select(Product).where(
            and_(
                Product.deleted_at == None,
                or_(Product.hidden_status == False, Product.hidden_status == None),
                or_(
                    Product.name.ilike(search_pattern),
                    Product.name_ar.ilike(search_pattern),
                    Product.sku.ilike(search_pattern)
                )
            )
        ).limit(limit)
    )
    products = [model_to_dict(p) for p in result.scalars().all()]
    
    # Search car brands
    result = await db.execute(
        select(CarBrand).where(
            and_(
                CarBrand.deleted_at == None,
                or_(CarBrand.name.ilike(search_pattern), CarBrand.name_ar.ilike(search_pattern))
            )
        ).limit(5)
    )
    car_brands = [model_to_dict(b) for b in result.scalars().all()]
    
    # Search car models
    result = await db.execute(
        select(CarModel).where(
            and_(
                CarModel.deleted_at == None,
                or_(CarModel.name.ilike(search_pattern), CarModel.name_ar.ilike(search_pattern))
            )
        ).limit(5)
    )
    car_models = [model_to_dict(m) for m in result.scalars().all()]
    
    # Search product brands
    result = await db.execute(
        select(ProductBrand).where(
            and_(ProductBrand.deleted_at == None, ProductBrand.name.ilike(search_pattern))
        ).limit(5)
    )
    product_brands = [model_to_dict(b) for b in result.scalars().all()]
    
    # Search categories
    result = await db.execute(
        select(Category).where(
            and_(
                Category.deleted_at == None,
                or_(Category.name.ilike(search_pattern), Category.name_ar.ilike(search_pattern))
            )
        ).limit(5)
    )
    categories = [model_to_dict(c) for c in result.scalars().all()]
    
    return {
        "products": products,
        "car_brands": car_brands,
        "car_models": car_models,
        "product_brands": product_brands,
        "categories": categories
    }

@api_router.get("/products/all")
async def get_all_products_admin(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Product).where(Product.deleted_at == None).order_by(Product.created_at.desc())
    )
    products = [model_to_dict(p) for p in result.scalars().all()]
    return {"products": products, "total": len(products)}

@api_router.get("/products/{product_id}")
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    # Try cache
    cached = await CacheService.get_product(product_id)
    if cached:
        return cached
    
    result = await db.execute(
        select(Product).options(
            selectinload(Product.product_brand),
            selectinload(Product.category),
            selectinload(Product.car_models)
        ).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product_dict = model_to_dict(product)
    product_dict["product_brand"] = model_to_dict(product.product_brand)
    product_dict["category"] = model_to_dict(product.category)
    product_dict["car_models"] = [model_to_dict(m) for m in product.car_models]
    product_dict["car_model_ids"] = [m.id for m in product.car_models]
    
    await CacheService.set_product(product_id, product_dict)
    return product_dict

@api_router.post("/products")
async def create_product(product: ProductCreate, db: AsyncSession = Depends(get_db)):
    product_data = product.dict()
    car_model_ids = product_data.pop("car_model_ids", [])
    
    db_product = Product(**product_data)
    db.add(db_product)
    await db.flush()
    
    # Add car model associations
    if car_model_ids:
        for model_id in car_model_ids:
            await db.execute(
                product_car_models.insert().values(product_id=db_product.id, car_model_id=model_id)
            )
    
    await log_sync_action(db, "products", db_product.id, "created")
    await db.commit()
    
    await CacheService.invalidate_products()
    await manager.broadcast({"type": "sync", "tables": ["products"]})
    
    return model_to_dict(db_product)

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, product: ProductCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    db_product = result.scalar_one_or_none()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product_data = product.dict()
    car_model_ids = product_data.pop("car_model_ids", [])
    
    for key, value in product_data.items():
        setattr(db_product, key, value)
    
    # Update car model associations
    await db.execute(
        delete(product_car_models).where(product_car_models.c.product_id == product_id)
    )
    for model_id in car_model_ids:
        await db.execute(
            product_car_models.insert().values(product_id=product_id, car_model_id=model_id)
        )
    
    await log_sync_action(db, "products", product_id, "updated")
    await db.commit()
    
    await CacheService.invalidate_products()
    await CacheService.delete(f"{CacheService.PREFIX_PRODUCTS}{product_id}")
    await manager.broadcast({"type": "sync", "tables": ["products"]})
    
    return {"message": "Updated successfully"}

@api_router.patch("/products/{product_id}/price")
async def update_product_price(product_id: str, price_data: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product.price = price_data.get("price", product.price)
    await log_sync_action(db, "products", product_id, "updated")
    await db.commit()
    
    await CacheService.invalidate_products()
    await manager.broadcast({"type": "sync", "tables": ["products"]})
    
    return {"message": "Price updated", "price": product.price}

@api_router.patch("/products/{product_id}/hidden")
async def update_product_hidden(product_id: str, hidden_data: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product.hidden_status = hidden_data.get("hidden_status", product.hidden_status)
    await log_sync_action(db, "products", product_id, "updated")
    await db.commit()
    
    await CacheService.invalidate_products()
    await manager.broadcast({"type": "sync", "tables": ["products"]})
    
    return {"message": "Hidden status updated", "hidden_status": product.hidden_status}

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product.deleted_at = datetime.now(timezone.utc)
    await log_sync_action(db, "products", product_id, "deleted")
    await db.commit()
    
    await CacheService.invalidate_products()
    await manager.broadcast({"type": "sync", "tables": ["products"]})
    
    return {"message": "Deleted successfully"}

# ==================== Cart Routes ====================

@api_router.get("/cart")
async def get_cart(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.execute(
        select(Cart).options(selectinload(Cart.items).selectinload(CartItem.product))
        .where(Cart.user_id == user.id)
    )
    cart = result.scalar_one_or_none()
    
    if not cart:
        return {"user_id": user.id, "items": []}
    
    items = []
    for item in cart.items:
        if item.product:
            items.append({
                "product_id": item.product_id,
                "quantity": item.quantity,
                "product": model_to_dict(item.product)
            })
    
    return {"user_id": user.id, "items": items}

@api_router.post("/cart/add")
async def add_to_cart(item: CartItemAdd, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify product exists
    result = await db.execute(select(Product).where(Product.id == item.product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Get or create cart
    result = await db.execute(select(Cart).where(Cart.user_id == user.id))
    cart = result.scalar_one_or_none()
    
    if not cart:
        cart = Cart(user_id=user.id)
        db.add(cart)
        await db.flush()
    
    # Check if item exists in cart
    result = await db.execute(
        select(CartItem).where(
            and_(CartItem.cart_id == cart.id, CartItem.product_id == item.product_id)
        )
    )
    cart_item = result.scalar_one_or_none()
    
    if cart_item:
        cart_item.quantity += item.quantity
    else:
        cart_item = CartItem(cart_id=cart.id, product_id=item.product_id, quantity=item.quantity)
        db.add(cart_item)
    
    await db.commit()
    return {"message": "Added to cart"}

@api_router.put("/cart/update")
async def update_cart_item(item: CartItemAdd, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.execute(select(Cart).where(Cart.user_id == user.id))
    cart = result.scalar_one_or_none()
    
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    if item.quantity <= 0:
        await db.execute(
            delete(CartItem).where(
                and_(CartItem.cart_id == cart.id, CartItem.product_id == item.product_id)
            )
        )
    else:
        await db.execute(
            update(CartItem).where(
                and_(CartItem.cart_id == cart.id, CartItem.product_id == item.product_id)
            ).values(quantity=item.quantity)
        )
    
    await db.commit()
    return {"message": "Cart updated"}

@api_router.delete("/cart/clear")
async def clear_cart(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.execute(select(Cart).where(Cart.user_id == user.id))
    cart = result.scalar_one_or_none()
    
    if cart:
        await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
        await db.commit()
    
    return {"message": "Cart cleared"}

# ==================== Order Routes ====================

@api_router.get("/orders")
async def get_orders(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.execute(
        select(Order).options(selectinload(Order.items))
        .where(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()
    
    return [
        {
            **model_to_dict(order),
            "items": [model_to_dict(item) for item in order.items]
        }
        for order in orders
    ]

@api_router.get("/orders/all")
async def get_all_orders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order).options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()
    
    return {
        "orders": [
            {
                **model_to_dict(order),
                "items": [model_to_dict(item) for item in order.items]
            }
            for order in orders
        ],
        "total": len(orders)
    }

@api_router.post("/orders")
async def create_order(order_data: OrderCreate, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get cart
    result = await db.execute(
        select(Cart).options(selectinload(Cart.items).selectinload(CartItem.product))
        .where(Cart.user_id == user.id)
    )
    cart = result.scalar_one_or_none()
    
    if not cart or not cart.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    
    # Build order
    subtotal = 0
    order_items = []
    
    for cart_item in cart.items:
        if cart_item.product:
            subtotal += cart_item.product.price * cart_item.quantity
            order_items.append(OrderItem(
                product_id=cart_item.product_id,
                product_name=cart_item.product.name,
                product_name_ar=cart_item.product.name_ar,
                quantity=cart_item.quantity,
                price=cart_item.product.price,
                image_url=cart_item.product.image_url
            ))
    
    shipping_cost = 150.0
    total = subtotal + shipping_cost
    
    order = Order(
        order_number=f"ORD-{datetime.now().strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:4].upper()}",
        user_id=user.id,
        customer_name=f"{order_data.first_name} {order_data.last_name}",
        customer_email=order_data.email,
        phone=order_data.phone,
        subtotal=subtotal,
        shipping_cost=shipping_cost,
        total=total,
        payment_method=order_data.payment_method,
        notes=order_data.notes,
        delivery_address={
            "street_address": order_data.street_address,
            "city": order_data.city,
            "state": order_data.state,
            "country": order_data.country,
            "delivery_instructions": order_data.delivery_instructions
        }
    )
    
    db.add(order)
    await db.flush()
    
    for item in order_items:
        item.order_id = order.id
        db.add(item)
    
    # Clear cart
    await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    
    await log_sync_action(db, "orders", order.id, "created", user.id)
    await db.commit()
    
    await manager.broadcast({"type": "sync", "tables": ["orders"]})
    
    return {
        **model_to_dict(order),
        "items": [model_to_dict(item) for item in order_items]
    }

@api_router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, db: AsyncSession = Depends(get_db)):
    valid_statuses = ["pending", "preparing", "shipped", "out_for_delivery", "delivered", "cancelled", "complete"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status")
    
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order.status = status
    await log_sync_action(db, "orders", order_id, "updated")
    await db.commit()
    
    await manager.broadcast({"type": "order_update", "order_id": order_id, "status": status})
    
    return {"message": "Status updated", "status": status}

# ==================== Favorites Routes ====================

@api_router.get("/favorites")
async def get_favorites(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.execute(
        select(Favorite).options(selectinload(Favorite.product))
        .where(and_(Favorite.user_id == user.id, Favorite.deleted_at == None))
    )
    favorites = result.scalars().all()
    
    return {
        "favorites": [
            {
                **model_to_dict(fav),
                "product": model_to_dict(fav.product) if fav.product else None
            }
            for fav in favorites if fav.product
        ],
        "total": len(favorites)
    }

@api_router.get("/favorites/check/{product_id}")
async def check_favorite(product_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.execute(
        select(Favorite).where(
            and_(Favorite.user_id == user.id, Favorite.product_id == product_id, Favorite.deleted_at == None)
        )
    )
    return {"is_favorite": result.scalar_one_or_none() is not None}

@api_router.post("/favorites/toggle")
async def toggle_favorite(data: FavoriteAdd, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.execute(
        select(Favorite).where(
            and_(Favorite.user_id == user.id, Favorite.product_id == data.product_id)
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        if existing.deleted_at:
            existing.deleted_at = None
            await log_sync_action(db, "favorites", existing.id, "updated", user.id)
            await db.commit()
            return {"is_favorite": True, "message": "Added to favorites"}
        else:
            existing.deleted_at = datetime.now(timezone.utc)
            await log_sync_action(db, "favorites", existing.id, "deleted", user.id)
            await db.commit()
            return {"is_favorite": False, "message": "Removed from favorites"}
    else:
        favorite = Favorite(user_id=user.id, product_id=data.product_id)
        db.add(favorite)
        await db.flush()
        await log_sync_action(db, "favorites", favorite.id, "created", user.id)
        await db.commit()
        return {"is_favorite": True, "message": "Added to favorites"}

# ==================== Comments Routes ====================

@api_router.get("/products/{product_id}/comments")
async def get_product_comments(product_id: str, request: Request, skip: int = 0, limit: int = 50, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    user_id = user.id if user else None
    
    result = await db.execute(
        select(Comment).where(
            and_(Comment.product_id == product_id, Comment.deleted_at == None)
        ).order_by(Comment.created_at.desc()).offset(skip).limit(limit)
    )
    comments = result.scalars().all()
    
    # Count and average
    count_result = await db.execute(
        select(func.count(), func.avg(Comment.rating)).where(
            and_(Comment.product_id == product_id, Comment.deleted_at == None, Comment.rating != None)
        )
    )
    row = count_result.one()
    rating_count = row[0] or 0
    avg_rating = float(row[1]) if row[1] else None
    
    return {
        "comments": [
            {
                **model_to_dict(c),
                "is_owner": c.user_id == user_id
            }
            for c in comments
        ],
        "total": len(comments),
        "avg_rating": round(avg_rating, 1) if avg_rating else None,
        "rating_count": rating_count
    }

@api_router.post("/products/{product_id}/comments")
async def add_comment(product_id: str, comment_data: CommentCreate, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if comment_data.rating and (comment_data.rating < 1 or comment_data.rating > 5):
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    
    comment = Comment(
        product_id=product_id,
        user_id=user.id,
        user_name=user.name,
        user_picture=user.picture,
        text=comment_data.text,
        rating=comment_data.rating
    )
    db.add(comment)
    await db.flush()
    await log_sync_action(db, "comments", comment.id, "created", user.id)
    await db.commit()
    
    return {**model_to_dict(comment), "is_owner": True}

# ==================== Customers Routes ====================

@api_router.get("/customers")
async def get_all_customers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.deleted_at == None).order_by(User.created_at.desc())
    )
    customers = [model_to_dict(c) for c in result.scalars().all()]
    return {"customers": customers, "total": len(customers)}

@api_router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).options(selectinload(User.orders))
        .where(User.id == customer_id)
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {
        **model_to_dict(customer),
        "orders": [model_to_dict(o) for o in customer.orders],
        "orders_count": len(customer.orders)
    }

# ==================== Sync Endpoints for WatermelonDB ====================

@api_router.post("/sync/pull")
async def sync_pull(pull_request: SyncPullRequest, db: AsyncSession = Depends(get_db)):
    """
    Pull changes since last_pulled_at for WatermelonDB sync
    Returns changes in format expected by WatermelonDB
    """
    last_pulled_at = pull_request.last_pulled_at or 0
    tables = pull_request.tables or ["car_brands", "car_models", "product_brands", "categories", "products"]
    
    changes = {}
    new_timestamp = get_timestamp_ms()
    
    # Convert ms timestamp to datetime for comparison
    last_pulled_dt = datetime.fromtimestamp(last_pulled_at / 1000, tz=timezone.utc) if last_pulled_at else datetime.min.replace(tzinfo=timezone.utc)
    
    for table in tables:
        created = []
        updated = []
        deleted = []
        
        if table == "car_brands":
            result = await db.execute(
                select(CarBrand).where(CarBrand.updated_at > last_pulled_dt)
            )
            for item in result.scalars().all():
                record = model_to_dict(item)
                if item.deleted_at:
                    deleted.append(item.id)
                elif item.created_at > last_pulled_dt:
                    created.append(record)
                else:
                    updated.append(record)
        
        elif table == "car_models":
            result = await db.execute(
                select(CarModel).where(CarModel.updated_at > last_pulled_dt)
            )
            for item in result.scalars().all():
                record = model_to_dict(item)
                if item.deleted_at:
                    deleted.append(item.id)
                elif item.created_at > last_pulled_dt:
                    created.append(record)
                else:
                    updated.append(record)
        
        elif table == "product_brands":
            result = await db.execute(
                select(ProductBrand).where(ProductBrand.updated_at > last_pulled_dt)
            )
            for item in result.scalars().all():
                record = model_to_dict(item)
                if item.deleted_at:
                    deleted.append(item.id)
                elif item.created_at > last_pulled_dt:
                    created.append(record)
                else:
                    updated.append(record)
        
        elif table == "categories":
            result = await db.execute(
                select(Category).where(Category.updated_at > last_pulled_dt)
            )
            for item in result.scalars().all():
                record = model_to_dict(item)
                if item.deleted_at:
                    deleted.append(item.id)
                elif item.created_at > last_pulled_dt:
                    created.append(record)
                else:
                    updated.append(record)
        
        elif table == "products":
            result = await db.execute(
                select(Product).where(Product.updated_at > last_pulled_dt)
            )
            for item in result.scalars().all():
                record = model_to_dict(item)
                # Get car_model_ids
                cm_result = await db.execute(
                    select(product_car_models.c.car_model_id).where(product_car_models.c.product_id == item.id)
                )
                record["car_model_ids"] = [r[0] for r in cm_result.all()]
                
                if item.deleted_at:
                    deleted.append(item.id)
                elif item.created_at > last_pulled_dt:
                    created.append(record)
                else:
                    updated.append(record)
        
        changes[table] = {
            "created": created,
            "updated": updated,
            "deleted": deleted
        }
    
    return {
        "changes": changes,
        "timestamp": new_timestamp
    }

@api_router.post("/sync/push")
async def sync_push(push_request: SyncPushRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Push local changes to server from WatermelonDB
    Server wins in conflict resolution
    """
    user = await get_current_user(request, db)
    user_id = user.id if user else None
    
    # Process each table's changes
    for table_name, table_changes in push_request.changes.items():
        # Handle creates
        for record in table_changes.created:
            try:
                if table_name == "favorites" and user_id:
                    fav = Favorite(
                        id=record.get("id"),
                        user_id=user_id,
                        product_id=record.get("product_id")
                    )
                    db.add(fav)
                    await db.flush()
                    await log_sync_action(db, table_name, fav.id, "created", user_id)
            except Exception as e:
                logger.warning(f"Sync push create error: {e}")
        
        # Handle updates - server wins, so we mostly ignore client updates
        # except for user-specific data
        
        # Handle deletes
        for record_id in table_changes.deleted:
            try:
                if table_name == "favorites" and user_id:
                    result = await db.execute(
                        select(Favorite).where(and_(Favorite.id == record_id, Favorite.user_id == user_id))
                    )
                    fav = result.scalar_one_or_none()
                    if fav:
                        fav.deleted_at = datetime.now(timezone.utc)
                        await log_sync_action(db, table_name, record_id, "deleted", user_id)
            except Exception as e:
                logger.warning(f"Sync push delete error: {e}")
    
    await db.commit()
    
    return {"status": "ok"}

# ==================== WebSocket Endpoint ====================

@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    """WebSocket for real-time sync notifications"""
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            # Handle authentication
            if data.get("type") == "auth":
                token = data.get("token")
                if token:
                    result = await db.execute(
                        select(UserSession).where(UserSession.session_token == token)
                    )
                    session = result.scalar_one_or_none()
                    if session:
                        manager.disconnect(websocket)
                        await manager.connect(websocket, session.user_id)
                        await websocket.send_json({"type": "auth_ok"})
            
            # Handle ping
            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ==================== Seed & Health ====================

@api_router.post("/seed")
async def seed_database(db: AsyncSession = Depends(get_db)):
    """Seed initial data"""
    result = await db.execute(select(func.count()).select_from(CarBrand))
    if result.scalar() > 0:
        return {"message": "Database already seeded"}
    
    # Car Brands
    car_brands = [
        CarBrand(id="cb_toyota", name="Toyota", name_ar="تويوتا"),
        CarBrand(id="cb_mitsubishi", name="Mitsubishi", name_ar="ميتسوبيشي"),
        CarBrand(id="cb_mazda", name="Mazda", name_ar="مازدا"),
    ]
    db.add_all(car_brands)
    
    # Car Models
    car_models = [
        CarModel(id="cm_camry", brand_id="cb_toyota", name="Camry", name_ar="كامري", year_start=2018, year_end=2024),
        CarModel(id="cm_corolla", brand_id="cb_toyota", name="Corolla", name_ar="كورولا", year_start=2019, year_end=2024),
        CarModel(id="cm_hilux", brand_id="cb_toyota", name="Hilux", name_ar="هايلكس", year_start=2016, year_end=2024),
        CarModel(id="cm_lancer", brand_id="cb_mitsubishi", name="Lancer", name_ar="لانسر", year_start=2015, year_end=2020),
        CarModel(id="cm_pajero", brand_id="cb_mitsubishi", name="Pajero", name_ar="باجيرو", year_start=2016, year_end=2024),
        CarModel(id="cm_mazda3", brand_id="cb_mazda", name="Mazda 3", name_ar="مازدا 3", year_start=2019, year_end=2024),
        CarModel(id="cm_cx5", brand_id="cb_mazda", name="CX-5", name_ar="سي اكس 5", year_start=2017, year_end=2024),
    ]
    db.add_all(car_models)
    
    # Product Brands
    product_brands = [
        ProductBrand(id="pb_kby", name="KBY"),
        ProductBrand(id="pb_ctr", name="CTR"),
        ProductBrand(id="pb_art", name="ART"),
    ]
    db.add_all(product_brands)
    
    # Categories
    categories = [
        Category(id="cat_engine", name="Engine", name_ar="المحرك", icon="engine"),
        Category(id="cat_suspension", name="Suspension", name_ar="نظام التعليق", icon="car-suspension"),
        Category(id="cat_clutch", name="Clutch", name_ar="الكلتش", icon="car-clutch"),
        Category(id="cat_electricity", name="Electricity", name_ar="الكهرباء", icon="lightning-bolt"),
        Category(id="cat_body", name="Body", name_ar="البودي", icon="car-door"),
        Category(id="cat_tires", name="Tires", name_ar="الإطارات", icon="car-tire-alert"),
    ]
    db.add_all(categories)
    await db.flush()
    
    # Subcategories
    subcategories = [
        Category(id="cat_filters", name="Filters", name_ar="الفلاتر", parent_id="cat_engine", icon="filter"),
        Category(id="cat_oil_filter", name="Oil Filter", name_ar="فلتر الزيت", parent_id="cat_filters", icon="oil"),
        Category(id="cat_air_filter", name="Air Filter", name_ar="فلتر الهواء", parent_id="cat_filters", icon="air-filter"),
        Category(id="cat_spark_plugs", name="Spark Plugs", name_ar="شمعات الاشتعال", parent_id="cat_engine", icon="flash"),
        Category(id="cat_shock_absorbers", name="Shock Absorbers", name_ar="ممتص الصدمات", parent_id="cat_suspension", icon="car-brake-abs"),
        Category(id="cat_clutch_kit", name="Clutch Kit", name_ar="طقم الكلتش", parent_id="cat_clutch", icon="cog"),
        Category(id="cat_batteries", name="Batteries", name_ar="البطاريات", parent_id="cat_electricity", icon="battery"),
        Category(id="cat_headlights", name="Headlights", name_ar="المصابيح الأمامية", parent_id="cat_electricity", icon="lightbulb"),
        Category(id="cat_mirrors", name="Mirrors", name_ar="المرايا", parent_id="cat_body", icon="flip-horizontal"),
    ]
    db.add_all(subcategories)
    await db.flush()
    
    # Products
    products = [
        Product(id="prod_oil_filter_1", name="Toyota Oil Filter", name_ar="فلتر زيت تويوتا", price=45.99, sku="TOY-OIL-001", category_id="cat_oil_filter", product_brand_id="pb_kby"),
        Product(id="prod_air_filter_1", name="Camry Air Filter", name_ar="فلتر هواء كامري", price=35.50, sku="CAM-AIR-001", category_id="cat_air_filter", product_brand_id="pb_ctr"),
        Product(id="prod_spark_plug_1", name="Iridium Spark Plugs Set", name_ar="طقم شمعات إريديوم", price=89.99, sku="SPK-IRD-001", category_id="cat_spark_plugs", product_brand_id="pb_art"),
        Product(id="prod_shock_1", name="Front Shock Absorber", name_ar="ممتص صدمات أمامي", price=125.00, sku="SHK-FRT-001", category_id="cat_shock_absorbers", product_brand_id="pb_kby"),
        Product(id="prod_clutch_kit_1", name="Complete Clutch Kit", name_ar="طقم كلتش كامل", price=299.99, sku="CLT-KIT-001", category_id="cat_clutch_kit", product_brand_id="pb_ctr"),
        Product(id="prod_battery_1", name="Car Battery 70Ah", name_ar="بطارية سيارة 70 أمبير", price=185.00, sku="BAT-70A-001", category_id="cat_batteries", product_brand_id="pb_art"),
        Product(id="prod_headlight_1", name="LED Headlight Bulb H7", name_ar="لمبة فانوس LED H7", price=55.00, sku="LED-H7-001", category_id="cat_headlights", product_brand_id="pb_kby"),
        Product(id="prod_mirror_1", name="Side Mirror Right", name_ar="مرآة جانبية يمين", price=145.00, sku="MIR-R-001", category_id="cat_mirrors", product_brand_id="pb_ctr"),
    ]
    db.add_all(products)
    await db.flush()
    
    # Product-CarModel associations
    associations = [
        ("prod_oil_filter_1", "cm_camry"), ("prod_oil_filter_1", "cm_corolla"),
        ("prod_air_filter_1", "cm_camry"),
        ("prod_spark_plug_1", "cm_camry"), ("prod_spark_plug_1", "cm_corolla"), ("prod_spark_plug_1", "cm_lancer"),
        ("prod_shock_1", "cm_hilux"), ("prod_shock_1", "cm_pajero"),
        ("prod_clutch_kit_1", "cm_lancer"), ("prod_clutch_kit_1", "cm_mazda3"),
        ("prod_battery_1", "cm_camry"), ("prod_battery_1", "cm_corolla"), ("prod_battery_1", "cm_hilux"), ("prod_battery_1", "cm_pajero"),
        ("prod_headlight_1", "cm_mazda3"), ("prod_headlight_1", "cm_cx5"),
        ("prod_mirror_1", "cm_camry"),
    ]
    for prod_id, model_id in associations:
        await db.execute(product_car_models.insert().values(product_id=prod_id, car_model_id=model_id))
    
    await db.commit()
    
    # Invalidate caches
    await CacheService.invalidate_car_brands()
    await CacheService.invalidate_car_models()
    await CacheService.invalidate_product_brands()
    await CacheService.invalidate_categories()
    await CacheService.invalidate_products()
    
    return {"message": "Database seeded successfully"}

@api_router.get("/")
async def root():
    return {"message": "Al-Ghazaly Auto Parts API v2.0", "status": "running", "architecture": "offline-first"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "database": "postgresql", "cache": "redis"}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting Al-Ghazaly API v2.0 - Offline-First Architecture")
    await init_db()
    logger.info("PostgreSQL database initialized")
    
    # Seed if empty
    async with async_session() as db:
        result = await db.execute(select(func.count()).select_from(CarBrand))
        if result.scalar() == 0:
            logger.info("Database empty, seeding...")
            await seed_database(db)
            logger.info("Database seeded")

@app.on_event("shutdown")
async def shutdown_event():
    await close_db()
    await close_redis()
    logger.info("Shutdown complete")
