import requests
import json

def test_connection():
    url = "http://localhost:8000/profiles/test-connection"
    
    # Test with invalid model string
    payload = {
        "llm_model": "invalid-model-name",
        "llm_api_key": "some-key"
    }
    print("Testing invalid model...")
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

    # Test with empty model
    payload = {
        "llm_model": "",
        "llm_api_key": "some-key"
    }
    print("\nTesting empty model...")
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    try:
        print(f"Response: {response.json()}")
    except:
        print("Response not JSON")

if __name__ == "__main__":
    test_connection()
