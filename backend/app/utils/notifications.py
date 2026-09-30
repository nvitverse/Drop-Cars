# import requests

# EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# def send_push_notification(expo_token: str, title: str, body: str):
#     """
#     Send a push notification via Expo Push API.
    
#     :param expo_token: The Expo push token (e.g., ExponentPushToken[xxxxxx])
#     :param title: Title of the notification
#     :param body: Body text of the notification
#     :return: JSON response from Expo
#     """
#     headers = {
#         "Content-Type": "application/json",
#         "Accept": "application/json"
#     }

#     payload = {
#         "to": expo_token,
#         "sound": "default",
#         "title": title,
#         "body": body,
#     }

#     response = requests.post(EXPO_PUSH_URL, json=payload, headers=headers)
#     return response.json()


# # Example usage:
# if __name__ == "__main__":
#     token = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"  # replace with real token
#     res = send_push_notification(token, "Hello 👋", "This is a test notification from Python!")
#     print(res)

from fastapi import FastAPI, Request
from pydantic import BaseModel
import httpx

app = FastAPI()

EXPO_API_URL = "https://exp.host/--/api/v2/push/send"
EXPO_PROJECT_ID = "your-expo-project-id"  # optional

# In-memory store for simplicity
expo_tokens = set()

class TokenData(BaseModel):
    token: str

@app.post("/register_token")
async def register_token(data: TokenData):
    expo_tokens.add(data.token)
    return {"message": "Token registered"}

@app.post("/send_notification")
async def send_notification(data: TokenData):
    payload = {
        "to": data.token,
        "title": "Hello from FastAPI",
        "body": "This is a test notification",
        "sound": "default"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(EXPO_API_URL, json=payload)
        return response.json()
