#!/usr/bin/env python3
"""
Backend API Testing for Al-Ghazaly Auto Parts
Testing DELETE endpoints, Cart void bundle, and API parameters
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Backend URL - using external URL from environment
BASE_URL = "https://ecommerce-dev-3.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        
    def test_health_check(self):
        """Test basic health check"""
        try:
            response = self.session.get(f"{BASE_URL}/health")
            if response.status_code == 200:
                data = response.json()
                version = data.get("version", "unknown")
                self.log_test("Health Check", True, f"Backend v{version} is running")
                return True
            else:
                self.log_test("Health Check", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Health Check", False, f"Connection error: {str(e)}")
            return False
    
    def test_promotions_list(self):
        """Test promotions list endpoint with active_only parameter"""
        try:
            # Test with active_only=false (should show all)
            response = self.session.get(f"{BASE_URL}/promotions?active_only=false")
            if response.status_code == 200:
                all_promotions = response.json()
                self.log_test("GET /promotions?active_only=false", True, 
                            f"Found {len(all_promotions)} total promotions")
                
                # Check if we have test promotions
                promo_ids = [p.get('id') for p in all_promotions]
                has_promo_1 = 'promo_1' in promo_ids
                has_promo_2 = 'promo_2' in promo_ids
                
                if has_promo_1 and has_promo_2:
                    self.log_test("Test Promotions Available", True, "promo_1 and promo_2 found")
                else:
                    self.log_test("Test Promotions Available", False, 
                                f"Missing test promotions. Found IDs: {promo_ids}")
                
                # Test with active_only=true (should show only active)
                response_active = self.session.get(f"{BASE_URL}/promotions?active_only=true")
                if response_active.status_code == 200:
                    active_promotions = response_active.json()
                    self.log_test("GET /promotions?active_only=true", True, 
                                f"Found {len(active_promotions)} active promotions")
                else:
                    self.log_test("GET /promotions?active_only=true", False, 
                                f"Status code: {response_active.status_code}")
                
                return True
            else:
                self.log_test("GET /promotions?active_only=false", False, 
                            f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Promotions List Test", False, f"Error: {str(e)}")
            return False
    
    def test_bundle_offers_list(self):
        """Test bundle offers list endpoint with active_only parameter"""
        try:
            # Test with active_only=false (should show all)
            response = self.session.get(f"{BASE_URL}/bundle-offers?active_only=false")
            if response.status_code == 200:
                all_bundles = response.json()
                self.log_test("GET /bundle-offers?active_only=false", True, 
                            f"Found {len(all_bundles)} total bundle offers")
                
                # Check if we have test bundles
                bundle_ids = [b.get('id') for b in all_bundles]
                has_bundle_1 = 'bundle_1' in bundle_ids
                has_bundle_2 = 'bundle_2' in bundle_ids
                has_bundle_3 = 'bundle_3' in bundle_ids
                
                if has_bundle_1 and has_bundle_2 and has_bundle_3:
                    self.log_test("Test Bundle Offers Available", True, 
                                "bundle_1, bundle_2, and bundle_3 found")
                else:
                    self.log_test("Test Bundle Offers Available", False, 
                                f"Missing test bundles. Found IDs: {bundle_ids}")
                
                # Test with active_only=true (should show only active)
                response_active = self.session.get(f"{BASE_URL}/bundle-offers?active_only=true")
                if response_active.status_code == 200:
                    active_bundles = response_active.json()
                    self.log_test("GET /bundle-offers?active_only=true", True, 
                                f"Found {len(active_bundles)} active bundle offers")
                else:
                    self.log_test("GET /bundle-offers?active_only=true", False, 
                                f"Status code: {response_active.status_code}")
                
                return True
            else:
                self.log_test("GET /bundle-offers?active_only=false", False, 
                            f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Bundle Offers List Test", False, f"Error: {str(e)}")
            return False
    
    def test_delete_promotion_without_auth(self):
        """Test DELETE /promotions/{id} without authentication"""
        try:
            # Test with promo_1
            response = self.session.delete(f"{BASE_URL}/promotions/promo_1")
            
            if response.status_code == 403:
                data = response.json()
                detail = data.get("detail", "")
                if "Access denied" in detail and "guest" in detail:
                    self.log_test("DELETE /promotions/promo_1 (no auth)", True, 
                                f"Correctly returned 403: {detail}")
                else:
                    self.log_test("DELETE /promotions/promo_1 (no auth)", False, 
                                f"Wrong error message: {detail}")
            else:
                self.log_test("DELETE /promotions/promo_1 (no auth)", False, 
                            f"Expected 403, got {response.status_code}")
            
            # Test with non-existent promotion
            response = self.session.delete(f"{BASE_URL}/promotions/non_existent")
            if response.status_code == 403:
                self.log_test("DELETE /promotions/non_existent (no auth)", True, 
                            "Auth check happens before existence check")
            else:
                self.log_test("DELETE /promotions/non_existent (no auth)", False, 
                            f"Expected 403, got {response.status_code}")
                
            return True
        except Exception as e:
            self.log_test("Delete Promotion Without Auth", False, f"Error: {str(e)}")
            return False
    
    def test_delete_bundle_offer_without_auth(self):
        """Test DELETE /bundle-offers/{id} without authentication"""
        try:
            # Test with bundle_1
            response = self.session.delete(f"{BASE_URL}/bundle-offers/bundle_1")
            
            if response.status_code == 403:
                data = response.json()
                detail = data.get("detail", "")
                if "Access denied" in detail and "guest" in detail:
                    self.log_test("DELETE /bundle-offers/bundle_1 (no auth)", True, 
                                f"Correctly returned 403: {detail}")
                else:
                    self.log_test("DELETE /bundle-offers/bundle_1 (no auth)", False, 
                                f"Wrong error message: {detail}")
            else:
                self.log_test("DELETE /bundle-offers/bundle_1 (no auth)", False, 
                            f"Expected 403, got {response.status_code}")
            
            # Test with non-existent bundle
            response = self.session.delete(f"{BASE_URL}/bundle-offers/non_existent")
            if response.status_code == 403:
                self.log_test("DELETE /bundle-offers/non_existent (no auth)", True, 
                            "Auth check happens before existence check")
            else:
                self.log_test("DELETE /bundle-offers/non_existent (no auth)", False, 
                            f"Expected 403, got {response.status_code}")
                
            return True
        except Exception as e:
            self.log_test("Delete Bundle Offer Without Auth", False, f"Error: {str(e)}")
            return False
    
    def test_cart_void_bundle_without_auth(self):
        """Test DELETE /cart/void-bundle/{bundle_group_id} without authentication"""
        try:
            response = self.session.delete(f"{BASE_URL}/cart/void-bundle/test_bundle_group")
            
            if response.status_code == 401:
                data = response.json()
                detail = data.get("detail", "")
                if "Not authenticated" in detail:
                    self.log_test("DELETE /cart/void-bundle/{id} (no auth)", True, 
                                f"Correctly returned 401: {detail}")
                else:
                    self.log_test("DELETE /cart/void-bundle/{id} (no auth)", False, 
                                f"Wrong error message: {detail}")
            else:
                self.log_test("DELETE /cart/void-bundle/{id} (no auth)", False, 
                            f"Expected 401, got {response.status_code}")
                
            return True
        except Exception as e:
            self.log_test("Cart Void Bundle Without Auth", False, f"Error: {str(e)}")
            return False
    
    def test_marketing_home_slider(self):
        """Test marketing home slider endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/marketing/home-slider")
            if response.status_code == 200:
                data = response.json()
                self.log_test("GET /marketing/home-slider", True, 
                            f"Found {len(data)} slider items")
                
                # Check structure of items
                if data:
                    first_item = data[0]
                    required_fields = ['type', 'id', 'title', 'is_active']
                    missing_fields = [field for field in required_fields if field not in first_item]
                    
                    if not missing_fields:
                        self.log_test("Home Slider Item Structure", True, 
                                    "All required fields present")
                    else:
                        self.log_test("Home Slider Item Structure", False, 
                                    f"Missing fields: {missing_fields}")
                
                return True
            else:
                self.log_test("GET /marketing/home-slider", False, 
                            f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Marketing Home Slider Test", False, f"Error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Backend API Tests for Al-Ghazaly Auto Parts")
        print("=" * 60)
        
        # Health check first
        if not self.test_health_check():
            print("❌ Backend is not accessible. Stopping tests.")
            return False
        
        print("\n📋 Testing API Parameter Functionality:")
        print("-" * 40)
        self.test_promotions_list()
        self.test_bundle_offers_list()
        
        print("\n🔒 Testing DELETE Endpoints Authentication:")
        print("-" * 40)
        self.test_delete_promotion_without_auth()
        self.test_delete_bundle_offer_without_auth()
        
        print("\n🛒 Testing Cart Void Bundle Endpoint:")
        print("-" * 40)
        self.test_cart_void_bundle_without_auth()
        
        print("\n🎯 Testing Marketing Endpoints:")
        print("-" * 40)
        self.test_marketing_home_slider()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        if total - passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        return passed == total

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)