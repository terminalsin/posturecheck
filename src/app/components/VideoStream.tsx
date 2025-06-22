'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { PostureIncident } from '../video/page'

interface VideoStreamProps {
    onPostureUpdate: (posture: { isGood: boolean; angle: number; message: string }) => void
    onIncident: (incident: PostureIncident) => void
    isRecording: boolean
    setIsRecording: (recording: boolean) => void
}

export default function VideoStream({
    onPostureUpdate,
    onIncident,
    isRecording,
    setIsRecording
}: VideoStreamProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const processedCanvasRef = useRef<HTMLCanvasElement>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const frameCountRef = useRef<number>(0)

    const [error, setError] = useState<string | null>(null)
    const [badPostureStart, setBadPostureStart] = useState<Date | null>(null)
    const [recordingChunks, setRecordingChunks] = useState<Blob[]>([])
    const [lastImageAnalysis, setLastImageAnalysis] = useState<Date>(new Date())
    const [frameCount, setFrameCount] = useState<number>(0)
    const [lastKneeAngle, setLastKneeAngle] = useState<number>(180)
    const [showProcessedVideo, setShowProcessedVideo] = useState<boolean>(false)
    const [debugMode, setDebugMode] = useState<boolean>(true)

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: false
            })

            if (videoRef.current) {
                videoRef.current.srcObject = stream
                streamRef.current = stream
                setIsRecording(true)
            }
        } catch (err) {
            setError('Failed to access camera: ' + (err as Error).message)
        }
    }, [setIsRecording])

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
            streamRef.current = null
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null
        }
        setIsRecording(false)
    }, [setIsRecording])

    const captureFrame = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current) {
            console.log('Missing video or canvas ref')
            return null
        }

        const canvas = canvasRef.current
        const video = videoRef.current
        const ctx = canvas.getContext('2d')

        if (!ctx) {
            console.log('No canvas context')
            return null
        }

        // Check if video is actually playing
        if (video.readyState < 2) {
            console.log('Video not ready, readyState:', video.readyState)
            return null
        }

        if (video.videoWidth === 0 || video.videoHeight === 0) {
            console.log('Video dimensions are 0:', video.videoWidth, 'x', video.videoHeight)
            return null
        }

        // Log current video time to see if it's advancing
        console.log('Video currentTime:', video.currentTime, 'paused:', video.paused)

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)

        return new Promise<Blob | null>((resolve) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    console.log('Frame captured, size:', blob.size, 'bytes')
                } else {
                    console.log('Failed to create blob from canvas')
                }
                resolve(blob)
            }, 'image/jpeg', 0.8)
        })
    }, [])

    const sendFrameToBackend = useCallback(async (frameBlob: Blob) => {
        try {
            const formData = new FormData()
            formData.append('frame', frameBlob)

            const response = await fetch('http://localhost:5001/api/upload-frame', {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                throw new Error('Failed to send frame to backend')
            }

            return await response.json()
        } catch (error) {
            console.error('Frame upload error:', error)
            return null
        }
    }, [])

    const fetchCurrentPosture = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:5001/api/current-posture')

            if (!response.ok) {
                throw new Error('Failed to fetch posture data')
            }

            const result = await response.json()

            if (result.isGood !== undefined) {
                onPostureUpdate({
                    isGood: result.isGood,
                    angle: result.angle,
                    message: result.message
                })
                setLastKneeAngle(result.angle)
            }

            return result
        } catch (error) {
            console.error('Posture fetch error:', error)
            return null
        }
    }, [onPostureUpdate])

    const toggleDebugMode = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:5001/api/debug-toggle', {
                method: 'POST'
            })

            if (!response.ok) {
                throw new Error('Failed to toggle debug mode')
            }

            const result = await response.json()
            setDebugMode(result.debug_mode)
            console.log(result.message)

            return result
        } catch (error) {
            console.error('Debug toggle error:', error)
            return null
        }
    }, [])

    const analyzePosture = useCallback(async (imageBlob: Blob) => {
        try {
            const formData = new FormData()
            formData.append('image', imageBlob)

            const response = await fetch('http://localhost:5001/api/posture-check', {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                throw new Error('Failed to analyze posture')
            }

            const result = await response.json()
            return result
        } catch (error) {
            console.error('Posture analysis error:', error)
            return null
        }
    }, [])

    const analyzeImage = useCallback(async (imageBlob: Blob) => {
        try {
            const formData = new FormData()
            formData.append('image', imageBlob)

            const response = await fetch('http://localhost:5001/api/image-analysis', {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                throw new Error('Failed to analyze image')
            }

            const result = await response.json()
            return result
        } catch (error) {
            console.error('Image analysis error:', error)
            return null
        }
    }, [])

    // Function to fetch and display processed video frames
    const fetchProcessedFrame = useCallback(async () => {
        if (!processedCanvasRef.current || !showProcessedVideo) return

        try {
            // Fetch current processed frame
            const response = await fetch('http://localhost:5001/api/current-frame', {
                method: 'GET',
                cache: 'no-cache'
            })

            if (!response.ok) {
                if (response.status !== 503 && response.status !== 404) {
                    console.error('Failed to fetch frame:', response.status)
                }
                return
            }

            const blob = await response.blob()
            const canvas = processedCanvasRef.current
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            // Create image from blob and draw to canvas
            const img = new Image()
            img.onload = () => {
                canvas.width = img.width
                canvas.height = img.height
                ctx.drawImage(img, 0, 0)
                URL.revokeObjectURL(img.src)
            }
            img.onerror = () => {
                console.error('Failed to load image from stream')
                URL.revokeObjectURL(img.src)
            }
            img.src = URL.createObjectURL(blob)

        } catch (error) {
            console.error('Failed to fetch processed frame:', error)
        }
    }, [showProcessedVideo])

    // Periodic frame fetching for processed video
    useEffect(() => {
        if (!showProcessedVideo) return

        const interval = setInterval(fetchProcessedFrame, 50) // Fetch at ~20 FPS

        return () => clearInterval(interval)
    }, [showProcessedVideo, fetchProcessedFrame])

    const startIncidentRecording = useCallback(() => {
        if (!streamRef.current) return

        const mediaRecorder = new MediaRecorder(streamRef.current)
        const chunks: Blob[] = []

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data)
            }
        }

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' })
            const duration = badPostureStart ? (Date.now() - badPostureStart.getTime()) / 1000 : 0
            const incident: PostureIncident = {
                id: Date.now().toString(),
                timestamp: badPostureStart || new Date(),
                duration: duration,
                videoBlob: blob,
                kneeAngle: lastKneeAngle || 180, // Use last recorded angle
                message: 'Bad posture detected'
            }
            onIncident(incident)
        }

        mediaRecorder.start()
        mediaRecorderRef.current = mediaRecorder

        // Stop recording after 10 seconds max
        setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop()
            }
        }, 10000)
    }, [badPostureStart, onIncident])

    const stopIncidentRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
        }
        mediaRecorderRef.current = null
    }, [])

    // Main analysis loop
    useEffect(() => {
        if (!isRecording) return

        const interval = setInterval(async () => {
            const frameBlob = await captureFrame()
            if (!frameBlob) return
            console.log('Frame captured')

            // Increment frame counter
            const currentFrame = frameCountRef.current + 1
            frameCountRef.current = currentFrame

            // Update UI frame count every 10 frames to avoid excessive re-renders
            if (currentFrame % 10 === 0) {
                setFrameCount(currentFrame)
            }

            // Send frame to backend for processing
            await sendFrameToBackend(frameBlob)

            // Get current posture data from backend (every frame for responsiveness)
            const postureResult = await fetchCurrentPosture()

            if (postureResult && postureResult.isGood !== undefined) {
                const { isGood, angle, message } = postureResult

                // Handle bad posture incidents
                if (!isGood) {
                    if (!badPostureStart) {
                        setBadPostureStart(new Date())
                    } else {
                        const duration = (Date.now() - badPostureStart.getTime()) / 1000
                        if (duration >= 5 && !mediaRecorderRef.current) {
                            startIncidentRecording()
                        }
                    }
                } else {
                    if (badPostureStart) {
                        setBadPostureStart(null)
                        stopIncidentRecording()
                    }
                }
            }

            // Analyze image for heavy items every 240 frames (~10 seconds at 24fps)
            if (currentFrame % 240 === 0) {
                const imageResult = await analyzeImage(frameBlob)
                console.log('Image analysis result:', imageResult)
                setLastImageAnalysis(new Date())
            }
        }, 42) // Analyze at ~24fps (1000ms / 24fps ≈ 42ms)

        return () => clearInterval(interval)
    }, [isRecording, captureFrame, sendFrameToBackend, fetchCurrentPosture, analyzeImage, badPostureStart, startIncidentRecording, stopIncidentRecording])

    // Start processed video stream when recording starts
    useEffect(() => {
        if (isRecording && !showProcessedVideo) {
            setTimeout(() => {
                setShowProcessedVideo(true)
            }, 2000) // Give backend time to process first frames
        } else if (!isRecording) {
            setShowProcessedVideo(false)
        }
    }, [isRecording, showProcessedVideo])

    useEffect(() => {
        startCamera()
        return () => {
            stopCamera()
        }
    }, [startCamera, stopCamera])

    if (error) {
        return (
            <div className="flex items-center justify-center h-64 bg-red-900/20 border border-red-500 rounded-lg">
                <div className="text-center">
                    <div className="text-red-400 text-lg font-semibold mb-2">Camera Error</div>
                    <div className="text-red-300">{error}</div>
                    <button
                        onClick={startCamera}
                        className="btn mt-4"
                    >
                        Retry Camera Access
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="relative">
            <div className="video-container">
                {/* Raw webcam feed (hidden when showing processed) */}
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`video-stream w-full max-w-full ${showProcessedVideo ? 'hidden' : ''}`}
                />

                {/* Processed video stream using canvas */}
                {showProcessedVideo && (
                    <canvas
                        ref={processedCanvasRef}
                        className="video-stream w-full max-w-full"
                    />
                )}

                <canvas
                    ref={canvasRef}
                    className="hidden"
                />

                {isRecording && (
                    <div className="absolute top-4 right-4 flex items-center space-x-2 bg-black/50 px-3 py-1 rounded-full">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-white text-sm font-medium">
                            {showProcessedVideo ? 'LIVE + AI' : 'LIVE'}
                        </span>
                    </div>
                )}

                {showProcessedVideo && (
                    <div className="absolute top-4 left-4 bg-blue-600/80 px-3 py-1 rounded-full">
                        <span className="text-white text-sm font-medium">🤖 MediaPipe Active</span>
                    </div>
                )}
            </div>

            <div className="flex justify-center mt-4 space-x-4">
                <button
                    onClick={isRecording ? stopCamera : startCamera}
                    className={`btn ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                >
                    {isRecording ? '⏹️ Stop' : '▶️ Start'} Camera
                </button>

                {isRecording && (
                    <>
                        <button
                            onClick={() => setShowProcessedVideo(!showProcessedVideo)}
                            className="btn bg-blue-600 hover:bg-blue-700"
                        >
                            {showProcessedVideo ? '👁️ Raw Feed' : '🤖 AI View'}
                        </button>

                        {showProcessedVideo && (
                            <button
                                onClick={toggleDebugMode}
                                className={`btn ${debugMode ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'}`}
                            >
                                {debugMode ? '🔍 Debug: ON' : '🔍 Debug: OFF'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
} 