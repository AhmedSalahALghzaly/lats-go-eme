#!/usr/bin/env python3
"""
Al-Ghazaly Auto Parts Backend API Testing Suite
Testing critical bug fixes for marketing system endpoints
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Backend URL configuration
BASE_URL = "https://ecommerce-autoparts.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'Al-Ghazaly-Backend-Tester/1.0'
        })
        self.test_results = []
        self.auth_token = None
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "success": success,
            "details": details,
            "response_data": response_data
        }
        self.test_results.append(result)
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if not success and response_data:
            print(f"   Response: {response_data}")
        print()

    def test_health_check(self):
        """Test basic API health"""
        try:
            response = self.session.get(f"{BASE_URL}/health")
            if response.status_code == 200:
                data = response.json()
                version = data.get("version", "unknown")
                self.log_test("Health Check", True, f"API version: {version}", data)
                return True
            else:
                self.log_test("Health Check", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("Health Check", False, f"Connection error: {str(e)}")
            return False

    def test_get_promotions(self):
        """Test GET /api/promotions to verify test data exists"""
        try:
            response = self.session.get(f"{BASE_URL}/promotions")
            if response.status_code == 200:
                promotions = response.json()
                promo_count = len(promotions)
                promo_ids = [p.get('id') for p in promotions]
                self.log_test("GET Promotions", True, f"Found {promo_count} promotions: {promo_ids}")
                return promotions
            else:
                self.log_test("GET Promotions", False, f"Status: {response.status_code}", response.text)
                return []
        except Exception as e:
            self.log_test("GET Promotions", False, f"Error: {str(e)}")
            return []

    def test_get_bundle_offers(self):
        """Test GET /api/bundle-offers to verify test data exists"""
        try:
            response = self.session.get(f"{BASE_URL}/bundle-offers")
            if response.status_code == 200:
                bundles = response.json()
                bundle_count = len(bundles)
                bundle_ids = [b.get('id') for b in bundles]
                self.log_test("GET Bundle Offers", True, f"Found {bundle_count} bundles: {bundle_ids}")
                return bundles
            else:
                self.log_test("GET Bundle Offers", False, f"Status: {response.status_code}", response.text)
                return []
        except Exception as e:
            self.log_test("GET Bundle Offers", False, f"Error: {str(e)}")
            return []

    def test_delete_promotion_without_auth(self, promotion_id: str):
        """Test DELETE /api/promotions/{promotion_id} without authentication - should return 403"""
        try:
            # Remove any auth headers
            headers = {k: v for k, v in self.session.headers.items() if k.lower() != 'authorization'}
            response = requests.delete(f"{BASE_URL}/promotions/{promotion_id}", headers=headers)
            
            if response.status_code == 403:
                self.log_test("DELETE Promotion (No Auth)", True, "Correctly returned 403 Forbidden")
                return True
            else:
                self.log_test("DELETE Promotion (No Auth)", False, 
                            f"Expected 403, got {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("DELETE Promotion (No Auth)", False, f"Error: {str(e)}")
            return False

    def test_delete_promotion_nonexistent(self):
        """Test DELETE /api/promotions/{promotion_id} with non-existent ID - should return 404"""
        try:
            fake_id = "nonexistent_promo_123"
            # Remove any auth headers to test without auth first
            headers = {k: v for k, v in self.session.headers.items() if k.lower() != 'authorization'}
            response = requests.delete(f"{BASE_URL}/promotions/{fake_id}", headers=headers)
            
            if response.status_code == 403:
                self.log_test("DELETE Promotion (Non-existent)", True, 
                            "Correctly returned 403 (auth required before checking existence)")
                return True
            elif response.status_code == 404:
                self.log_test("DELETE Promotion (Non-existent)", True, "Correctly returned 404 Not Found")
                return True
            else:
                self.log_test("DELETE Promotion (Non-existent)", False, 
                            f"Expected 403 or 404, got {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("DELETE Promotion (Non-existent)", False, f"Error: {str(e)}")
            return False

    def test_delete_bundle_offer_without_auth(self, bundle_id: str):
        """Test DELETE /api/bundle-offers/{offer_id} without authentication - should return 403"""
        try:
            # Remove any auth headers
            headers = {k: v for k, v in self.session.headers.items() if k.lower() != 'authorization'}
            response = requests.delete(f"{BASE_URL}/bundle-offers/{bundle_id}", headers=headers)
            
            if response.status_code == 403:
                self.log_test("DELETE Bundle Offer (No Auth)", True, "Correctly returned 403 Forbidden")
                return True
            else:
                self.log_test("DELETE Bundle Offer (No Auth)", False, 
                            f"Expected 403, got {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("DELETE Bundle Offer (No Auth)", False, f"Error: {str(e)}")
            return False

    def test_delete_bundle_offer_nonexistent(self):
        """Test DELETE /api/bundle-offers/{offer_id} with non-existent ID - should return 404"""
        try:
            fake_id = "nonexistent_bundle_123"
            # Remove any auth headers to test without auth first
            headers = {k: v for k, v in self.session.headers.items() if k.lower() != 'authorization'}
            response = requests.delete(f"{BASE_URL}/bundle-offers/{fake_id}", headers=headers)
            
            if response.status_code == 403:
                self.log_test("DELETE Bundle Offer (Non-existent)", True, 
                            "Correctly returned 403 (auth required before checking existence)")
                return True
            elif response.status_code == 404:
                self.log_test("DELETE Bundle Offer (Non-existent)", True, "Correctly returned 404 Not Found")
                return True
            else:
                self.log_test("DELETE Bundle Offer (Non-existent)", False, 
                            f"Expected 403 or 404, got {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("DELETE Bundle Offer (Non-existent)", False, f"Error: {str(e)}")
            return False

    def test_get_bundle_offer_by_id(self, bundle_id: str):
        """Test GET /api/bundle-offers/{offer_id} - should return offer with products array populated"""
        try:
            response = self.session.get(f"{BASE_URL}/bundle-offers/{bundle_id}")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ['name', 'description', 'discount_percentage', 'product_ids', 'is_active']
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("GET Bundle Offer by ID", False, 
                                f"Missing required fields: {missing_fields}", data)
                    return False
                
                # Check if products array is populated
                if 'products' in data and isinstance(data['products'], list):
                    product_count = len(data['products'])
                    product_ids_count = len(data.get('product_ids', []))
                    
                    self.log_test("GET Bundle Offer by ID", True, 
                                f"Bundle '{data.get('name')}' has {product_count} products populated, {product_ids_count} product IDs")
                    return True
                else:
                    self.log_test("GET Bundle Offer by ID", False, 
                                "Products array not populated or missing", data)
                    return False
            elif response.status_code == 404:
                self.log_test("GET Bundle Offer by ID", False, 
                            f"Bundle {bundle_id} not found", response.text)
                return False
            else:
                self.log_test("GET Bundle Offer by ID", False, 
                            f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("GET Bundle Offer by ID", False, f"Error: {str(e)}")
            return False

    def test_get_car_model_by_id(self, model_id: str = "cm_corolla"):
        """Test GET /api/car-models/{model_id} - should return car model with brand info"""
        try:
            response = self.session.get(f"{BASE_URL}/car-models/{model_id}")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ['name', 'compatible_products']
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("GET Car Model by ID", False, 
                                f"Missing required fields: {missing_fields}", data)
                    return False
                
                # Check if brand info is populated
                if 'brand' in data and data['brand'] is not None:
                    brand_name = data['brand'].get('name', 'Unknown')
                    compatible_count = len(data.get('compatible_products', []))
                    
                    self.log_test("GET Car Model by ID", True, 
                                f"Model '{data.get('name')}' has brand '{brand_name}' and {compatible_count} compatible products")
                    return True
                else:
                    # Check if car_brand_id field exists (compatibility check)
                    if 'car_brand_id' in data or 'brand_id' in data:
                        self.log_test("GET Car Model by ID", True, 
                                    f"Model '{data.get('name')}' has brand ID field but brand object not populated")
                        return True
                    else:
                        self.log_test("GET Car Model by ID", False, 
                                    "Brand info not populated and no brand_id field", data)
                        return False
            elif response.status_code == 404:
                self.log_test("GET Car Model by ID", False, 
                            f"Car model {model_id} not found", response.text)
                return False
            else:
                self.log_test("GET Car Model by ID", False, 
                            f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("GET Car Model by ID", False, f"Error: {str(e)}")
            return False

    def test_marketing_home_slider(self):
        """Test GET /api/marketing/home-slider - should return combined list of promotions and bundle offers"""
        try:
            response = self.session.get(f"{BASE_URL}/marketing/home-slider")
            
            if response.status_code == 200:
                data = response.json()
                
                if not isinstance(data, list):
                    self.log_test("Marketing Home Slider", False, 
                                "Response should be an array", data)
                    return False
                
                # Analyze the slider items
                promotion_items = [item for item in data if item.get('type') == 'promotion']
                bundle_items = [item for item in data if item.get('type') == 'bundle_offer']
                
                # Check required fields for each item
                required_fields = ['type', 'id', 'title', 'image', 'is_active']
                all_valid = True
                
                for item in data:
                    missing_fields = [field for field in required_fields if field not in item]
                    if missing_fields:
                        self.log_test("Marketing Home Slider", False, 
                                    f"Item missing fields: {missing_fields}", item)
                        all_valid = False
                        break
                
                if all_valid:
                    total_items = len(data)
                    promo_count = len(promotion_items)
                    bundle_count = len(bundle_items)
                    
                    self.log_test("Marketing Home Slider", True, 
                                f"Found {total_items} slider items: {promo_count} promotions, {bundle_count} bundle offers")
                    return True
                else:
                    return False
            else:
                self.log_test("Marketing Home Slider", False, 
                            f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("Marketing Home Slider", False, f"Error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Al-Ghazaly Auto Parts Backend API Tests")
        print("=" * 60)
        
        # Test 1: Health check
        if not self.test_health_check():
            print("❌ Health check failed. Stopping tests.")
            return False
        
        # Test 2: Get existing data for testing
        promotions = self.test_get_promotions()
        bundles = self.test_get_bundle_offers()
        
        # Test 3: DELETE Promotions Endpoint Tests
        print("\n🔍 Testing DELETE Promotions Endpoint...")
        if promotions:
            first_promo_id = promotions[0].get('id')
            if first_promo_id:
                self.test_delete_promotion_without_auth(first_promo_id)
        
        self.test_delete_promotion_nonexistent()
        
        # Test 4: DELETE Bundle Offers Endpoint Tests  
        print("\n🔍 Testing DELETE Bundle Offers Endpoint...")
        if bundles:
            first_bundle_id = bundles[0].get('id')
            if first_bundle_id:
                self.test_delete_bundle_offer_without_auth(first_bundle_id)
        
        self.test_delete_bundle_offer_nonexistent()
        
        # Test 5: Bundle Offer GetById Endpoint
        print("\n🔍 Testing Bundle Offer GetById Endpoint...")
        if bundles:
            # Test with first available bundle
            first_bundle_id = bundles[0].get('id')
            if first_bundle_id:
                self.test_get_bundle_offer_by_id(first_bundle_id)
            
            # Also test with expected bundle_1 if it exists
            bundle_1_exists = any(b.get('id') == 'bundle_1' for b in bundles)
            if bundle_1_exists:
                self.test_get_bundle_offer_by_id('bundle_1')
        else:
            # Test with expected bundle_1 anyway
            self.test_get_bundle_offer_by_id('bundle_1')
        
        # Test 6: Car Model GetById Endpoint
        print("\n🔍 Testing Car Model GetById Endpoint...")
        self.test_get_car_model_by_id('cm_corolla')
        
        # Test 7: Marketing Home Slider Endpoint
        print("\n🔍 Testing Marketing Home Slider Endpoint...")
        self.test_marketing_home_slider()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result['success'])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)