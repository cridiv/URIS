import boto3
import json
import os
from dotenv import load_dotenv

load_dotenv()

def get_bedrock_client():
    return boto3.client(
        "bedrock-runtime",
        region_name=os.getenv("AWS_REGION"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
    )

def invoke_nova(system_prompt: str, user_message: str, max_tokens: int = 2000) -> str:
    client = get_bedrock_client()
    
    response = client.converse(
        modelId="amazon.nova-lite-v1:0",
        system=[{"text": system_prompt}],
        messages=[
            {"role": "user", "content": [{"text": user_message}]}
        ],
        inferenceConfig={
            "maxTokens": max_tokens,
            "temperature": 0.3
        }
    )
    
    return response["output"]["message"]["content"][0]["text"]