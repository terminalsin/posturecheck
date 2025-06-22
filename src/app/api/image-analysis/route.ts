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
        const tempPath = join(process.cwd(), 'temp_image_analysis.jpg')

        await writeFile(tempPath, buffer)

        try {
            // Call Python image analysis script
            const result = await runImageAnalysis(tempPath)

            // Clean up temp file
            await unlink(tempPath)

            return NextResponse.json(result)
        } catch (error) {
            // Clean up temp file even if error occurs
            try {
                await unlink(tempPath)
            } catch { }

            console.error('Image analysis error:', error)
            return NextResponse.json(
                { error: 'Failed to analyze image' },
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

function runImageAnalysis(imagePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
        // Check if GOOGLE_API_KEY is available
        if (!process.env.GOOGLE_API_KEY) {
            resolve({
                items: [],
                person_detected: false,
                analysis_notes: "Google API key not configured - skipping image analysis",
                error: "API key missing"
            })
            return
        }

        // Use the existing image_analysis.py script
        const python = spawn('python3', [
            join(process.cwd(), 'image_analysis.py'),
            '-i',
            imagePath
        ], {
            env: {
                ...process.env,
                GOOGLE_API_KEY: process.env.GOOGLE_API_KEY
            }
        })

        let output = ''
        let errorOutput = ''

        python.stdout.on('data', (data) => {
            output += data.toString()
        })

        python.stderr.on('data', (data) => {
            errorOutput += data.toString()
        })

        python.on('close', (code) => {
            if (code !== 0) {
                console.error('Python image analysis error:', errorOutput)
                // Don't reject, return a default response
                resolve({
                    items: [],
                    person_detected: false,
                    analysis_notes: `Image analysis failed: ${errorOutput}`,
                    error: `Process exited with code ${code}`
                })
                return
            }

            try {
                const result = JSON.parse(output.trim())
                resolve(result)
            } catch (parseError) {
                console.error('JSON parse error:', parseError, 'Output:', output)
                resolve({
                    items: [],
                    person_detected: false,
                    analysis_notes: `Parse error: ${output}`,
                    error: 'Failed to parse analysis result'
                })
            }
        })

        python.on('error', (error) => {
            console.error('Python spawn error:', error)
            resolve({
                items: [],
                person_detected: false,
                analysis_notes: `Spawn error: ${error.message}`,
                error: error.message
            })
        })
    })
} 