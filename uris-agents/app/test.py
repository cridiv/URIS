import boto3 
import json
from dotenv import load_dotenv
import os

load_dotenv()

client = boto3.client(
    "bedrock-runtime",
    region_name=os.getenv("AWS_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)

response = client.converse(
    modelId="amazon.nova-lite-v1:0",
    messages=[
        {"role": "user", "content": [{"text": "Say hello"}]}
    ]
)

print(response["output"]["message"]["content"][0]["text"])