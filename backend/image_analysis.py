import argparse
import base64
from google import genai
from google.genai import types
import mimetypes
import requests
import os
import json

prompt = """
            Analyze this image and identify any items that a person is carrying, holding, or wearing as accessories. 
            Focus on:
            - Bags (backpacks, handbags, briefcases, etc.)
            - Electronic devices (laptops, tablets, phones)
            - Books, documents, folders
            - Sports equipment
            - Tools or equipment
            - Containers (water bottles, coffee cups, etc.)
            - Any other objects being carried
            
            For each item identified, provide:
            1. The item name
            2. A brief description
            3. Your confidence level (1-10)
            4. The weight of the item in grams. Do not include any other text in the weight field. Simply a number.
            
            Return the response in JSON format like this:
            {
                "items": [
                    {
                        "name": "item_name",
                        "description": "brief description",
                        "confidence": 8
                        "weight": 100
                    }
                ],
                "person_detected": true/false,
                "analysis_notes": "any additional observations"
            }
            
            If no person is detected or no items are being carried, indicate this clearly.
            """


class ImageAnalysis:
    def __init__(self, image_path, api_key):
        self.image_path = image_path
        self.api_key = api_key

        # Check if it's a URL or local file path
        if image_path.startswith(("http://", "https://")):
            # Handle URL
            self.image_bytes = requests.get(image_path).content
        else:
            # Handle local file
            with open(image_path, "rb") as f:
                self.image_bytes = f.read()

        # Detect MIME type
        mime_type, _ = mimetypes.guess_type(image_path)
        if mime_type is None or not mime_type.startswith("image/"):
            # Default to jpeg if we can't determine the type
            mime_type = "image/jpeg"
        self.client = genai.Client(api_key=api_key)
        self.image = self.client.files.upload(file=self.image_path)

    def analyze(self) -> dict:
        """Analyze image to identify carried items"""
        # Check if file exists
        if not os.path.exists(self.image_path):
            raise FileNotFoundError(f"Image file not found: {self.image_path}")

        # Read the image file
        with open(self.image_path, "rb") as f:
            image_bytes = f.read()

        # Determine MIME type based on file extension
        file_extension = self.image_path.lower().split(".")[-1]
        if file_extension in ["jpg", "jpeg"]:
            mime_type = "image/jpeg"
        else:
            mime_type = "image/jpeg"  # Default fallback

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")

        # Create the prompt for item identification
        # Construct REST API request
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={self.api_key}"

        headers = {
            "Content-Type": "application/json",
        }

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": image_base64,
                            }
                        },
                    ]
                }
            ]
        }

        # Make API call to Gemini
        response = requests.post(url, headers=headers, json=payload)

        if response.status_code == 200:
            result = response.json()
            if "candidates" in result and len(result["candidates"]) > 0:
                response_text = result["candidates"][0]["content"]["parts"][0]["text"]
            else:
                raise Exception("Unexpected API response format")
        else:
            raise Exception(
                f"API call failed: {response.status_code} - {response.text}"
            )

        try:
            # Clean the response text (remove markdown code blocks if present)
            cleaned_text = response_text.strip()
            if cleaned_text.startswith("```json"):
                # Remove ```json at the start and ``` at the end
                cleaned_text = cleaned_text[7:]  # Remove ```json
                if cleaned_text.endswith("```"):
                    cleaned_text = cleaned_text[:-3]  # Remove ```
                cleaned_text = cleaned_text.strip()
            elif cleaned_text.startswith("```"):
                # Remove ``` at the start and end
                lines = cleaned_text.split("\n")
                if lines[0] == "```":
                    lines = lines[1:]
                if lines[-1] == "```":
                    lines = lines[:-1]
                cleaned_text = "\n".join(lines)

                # Try to parse as JSON
            analysis_result = json.loads(cleaned_text)
        except json.JSONDecodeError:
            # If JSON parsing fails, create a structured response
            analysis_result = {
                "items": [],
                "person_detected": False,
                "analysis_notes": f"Raw response: {response_text}",
                "parsing_error": True,
            }
        return analysis_result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--image", type=str, required=True)
    args = parser.parse_args()

    image_analysis = ImageAnalysis(
        args.image,
        api_key=os.getenv("GOOGLE_API_KEY"),
    )
    print(image_analysis.analyze())
