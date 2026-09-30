#!/usr/bin/env python3
"""
Test script for the recreate order API and vendor order details API functionality.
This script tests both endpoints with different scenarios.
"""

import requests
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"  # Adjust if your server runs on different port
RECREATE_ENDPOINT = f"{BASE_URL}/api/v1/new-orders/recreate"
VENDOR_ORDER_DETAILS_ENDPOINT = f"{BASE_URL}/api/v1/order/vendor"

def test_recreate_order():
    """Test the recreate order API endpoint"""
    
    # Test data - you'll need to replace these with actual values from your database
    test_cases = [
        {
            "name": "Test recreate with valid order ID and custom max_time",
            "order_id": 1,  # Replace with actual auto_cancelled order ID
            "max_time_to_assign_order": 30,  # Custom time
            "expected_status": 201
        },
        {
            "name": "Test recreate with default max_time",
            "order_id": 2,  # Replace with actual auto_cancelled order ID
            "max_time_to_assign_order": None,  # Will use default 15
            "expected_status": 201
        },
        {
            "name": "Test recreate with non-existent order ID",
            "order_id": 99999,
            "max_time_to_assign_order": 15,
            "expected_status": 400
        },
        {
            "name": "Test recreate with order not belonging to vendor",
            "order_id": 3,  # Replace with order ID from different vendor
            "max_time_to_assign_order": 15,
            "expected_status": 400
        },
        {
            "name": "Test recreate with non-auto_cancelled order",
            "order_id": 4,  # Replace with order ID that's not auto_cancelled
            "max_time_to_assign_order": 15,
            "expected_status": 400
        }
    ]
    
    print("Testing Recreate Order API")
    print("=" * 50)
    
    for test_case in test_cases:
        print(f"\nTest: {test_case['name']}")
        print(f"Order ID: {test_case['order_id']}")
        print(f"Max Time: {test_case['max_time_to_assign_order']}")
        
        # Prepare request payload
        payload = {
            "order_id": test_case['order_id']
        }
        if test_case['max_time_to_assign_order'] is not None:
            payload["max_time_to_assign_order"] = test_case['max_time_to_assign_order']
        
        try:
            # Make API request
            # Note: You'll need to include proper authentication headers
            headers = {
                "Content-Type": "application/json",
                # Add your authentication token here
                # "Authorization": "Bearer YOUR_TOKEN_HERE"
            }
            
            response = requests.post(
                RECREATE_ENDPOINT,
                json=payload,
                headers=headers,
                timeout=10
            )
            
            print(f"Status Code: {response.status_code}")
            print(f"Expected: {test_case['expected_status']}")
            
            if response.status_code == test_case['expected_status']:
                print("✅ PASS")
            else:
                print("❌ FAIL")
            
            # Print response details
            try:
                response_data = response.json()
                print(f"Response: {json.dumps(response_data, indent=2)}")
            except:
                print(f"Response Text: {response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ REQUEST ERROR: {e}")
        except Exception as e:
            print(f"❌ UNEXPECTED ERROR: {e}")
        
        print("-" * 30)

def test_vendor_order_details():
    """Test the vendor order details API endpoint"""
    
    # Test data - you'll need to replace these with actual values from your database
    test_cases = [
        {
            "name": "Test get order details for NEW_ORDERS",
            "order_id": 1,  # Replace with actual order ID from NEW_ORDERS
            "expected_status": 200
        },
        {
            "name": "Test get order details for HOURLY_RENTAL",
            "order_id": 2,  # Replace with actual order ID from HOURLY_RENTAL
            "expected_status": 200
        },
        {
            "name": "Test get order details for non-existent order",
            "order_id": 99999,
            "expected_status": 404
        },
        {
            "name": "Test get order details for order not belonging to vendor",
            "order_id": 3,  # Replace with order ID from different vendor
            "expected_status": 404
        }
    ]
    
    print("\nTesting Vendor Order Details API")
    print("=" * 50)
    
    for test_case in test_cases:
        print(f"\nTest: {test_case['name']}")
        print(f"Order ID: {test_case['order_id']}")
        
        try:
            # Make API request
            # Note: You'll need to include proper authentication headers
            headers = {
                "Content-Type": "application/json",
                # Add your authentication token here
                # "Authorization": "Bearer YOUR_TOKEN_HERE"
            }
            
            response = requests.get(
                f"{VENDOR_ORDER_DETAILS_ENDPOINT}/{test_case['order_id']}",
                headers=headers,
                timeout=10
            )
            
            print(f"Status Code: {response.status_code}")
            print(f"Expected: {test_case['expected_status']}")
            
            if response.status_code == test_case['expected_status']:
                print("✅ PASS")
            else:
                print("❌ FAIL")
            
            # Print response details
            try:
                response_data = response.json()
                print(f"Response: {json.dumps(response_data, indent=2)}")
                
                # Check if source-specific fields are populated correctly
                if response.status_code == 200:
                    if response_data.get('source') == 'NEW_ORDERS':
                        if response_data.get('cost_per_km') is not None:
                            print("✅ NEW_ORDERS specific fields populated")
                        else:
                            print("⚠️ NEW_ORDERS specific fields missing")
                    elif response_data.get('source') == 'HOURLY_RENTAL':
                        if response_data.get('package_hours') is not None:
                            print("✅ HOURLY_RENTAL specific fields populated")
                        else:
                            print("⚠️ HOURLY_RENTAL specific fields missing")
                            
            except:
                print(f"Response Text: {response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ REQUEST ERROR: {e}")
        except Exception as e:
            print(f"❌ UNEXPECTED ERROR: {e}")
        
        print("-" * 30)

def test_api_structure():
    """Test the API structure and validate the endpoints exist"""
    print("\nTesting API Structure")
    print("=" * 50)
    
    endpoints_to_test = [
        ("Recreate Order", RECREATE_ENDPOINT, {"order_id": 1}),
        ("Vendor Order Details", f"{VENDOR_ORDER_DETAILS_ENDPOINT}/1", None)
    ]
    
    for name, endpoint, payload in endpoints_to_test:
        try:
            if payload:
                # POST request
                response = requests.post(endpoint, json=payload, timeout=5)
            else:
                # GET request
                response = requests.get(endpoint, timeout=5)
            
            print(f"{name} Endpoint Status: {response.status_code}")
            if response.status_code == 401:
                print("✅ Endpoint exists (authentication required)")
            elif response.status_code == 422:
                print("✅ Endpoint exists (validation error)")
            elif response.status_code == 404:
                print("✅ Endpoint exists (resource not found)")
            else:
                print(f"Response: {response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ {name} endpoint not accessible: {e}")

if __name__ == "__main__":
    print("Recreate Order & Vendor Order Details API Test Suite")
    print("=" * 60)
    print(f"Testing endpoints:")
    print(f"  - Recreate: {RECREATE_ENDPOINT}")
    print(f"  - Vendor Details: {VENDOR_ORDER_DETAILS_ENDPOINT}/{{order_id}}")
    print(f"Timestamp: {datetime.now()}")
    
    # Test API structure first
    test_api_structure()
    
    # Test recreate order functionality
    test_recreate_order()
    
    # Test vendor order details functionality
    test_vendor_order_details()
    
    print("\n" + "=" * 60)
    print("Test suite completed!")
    print("\nNote: To run actual tests, you need to:")
    print("1. Start your FastAPI server")
    print("2. Replace test order IDs with actual values from your database")
    print("3. Add proper authentication headers")
    print("4. Ensure you have auto_cancelled orders in your database")
    print("5. Test with different order types (NEW_ORDERS, HOURLY_RENTAL)")
