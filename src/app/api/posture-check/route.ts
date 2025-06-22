import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('image') as File

        if (!file) {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 })
        }

        // Save the uploaded file temporarily
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const tempPath = join(process.cwd(), 'temp_posture_check.jpg')

        await writeFile(tempPath, buffer)

        try {
            // Call Python posture checking script
            const result = await runPostureCheck(tempPath)

            // Clean up temp file
            await unlink(tempPath)

            return NextResponse.json(result)
        } catch (error) {
            // Clean up temp file even if error occurs
            try {
                await unlink(tempPath)
            } catch { }

            console.error('Posture check error:', error)
            return NextResponse.json(
                { error: 'Failed to analyze posture' },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error('API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

function runPostureCheck(imagePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
        // Create a Python script that uses our posture_check.py
        const pythonScript = `
import sys
import os
import cv2
import mediapipe as mp
import json
sys.path.append('${process.cwd()}')
from posture_check import check_lifting_posture

# Initialize MediaPipe Pose
mp_pose = mp.solutions.pose
pose = mp_pose.Pose(
    static_image_mode=True,
    model_complexity=2,
    enable_segmentation=False,
    min_detection_confidence=0.5
)

# Read and process image
image_path = sys.argv[1]
image = cv2.imread(image_path)
if image is None:
    print(json.dumps({"error": "Could not read image"}))
    sys.exit(1)

# Convert BGR to RGB
image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

# Process the image
results = pose.process(image_rgb)

if results.pose_landmarks:
    # Call our posture checking function
    is_good, angle, message = check_lifting_posture(results.pose_landmarks)
    
    if is_good is not None:
        result = {
            "isGood": is_good,
            "angle": float(angle),
            "message": message,
            "landmarks_detected": True
        }
    else:
        result = {
            "error": message,
            "landmarks_detected": True
        }
else:
    result = {
        "error": "No pose landmarks detected",
        "landmarks_detected": False
    }

print(json.dumps(result))
`

        // Write the Python script to a temporary file
        const scriptPath = join(process.cwd(), 'temp_posture_script.py')
        require('fs').writeFileSync(scriptPath, pythonScript)

        const python = spawn('python3', [scriptPath, imagePath])
        let output = ''
        let errorOutput = ''

        python.stdout.on('data', (data) => {
            output += data.toString()
        })

        python.stderr.on('data', (data) => {
            errorOutput += data.toString()
        })

        python.on('close', (code) => {
            // Clean up temp script
            try {
                require('fs').unlinkSync(scriptPath)
            } catch { }

            if (code !== 0) {
                console.error('Python script error:', errorOutput)
                reject(new Error(`Python script failed with code ${code}: ${errorOutput}`))
                return
            }

            try {
                const result = JSON.parse(output.trim())
                resolve(result)
            } catch (parseError) {
                console.error('JSON parse error:', parseError, 'Output:', output)
                reject(new Error('Failed to parse Python script output'))
            }
        })

        python.on('error', (error) => {
            console.error('Python spawn error:', error)
            reject(error)
        })
    })
} 