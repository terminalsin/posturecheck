'use client'

import { useState, useRef, useEffect } from 'react'
import VideoStream from '../components/VideoStream'
import IncidentFeed from '../components/IncidentFeed'
import Link from 'next/link'

export interface PostureIncident {
    id: string
    timestamp: Date
    duration: number
    videoBlob?: Blob
    kneeAngle: number
    message: string
}

export default function VideoPage() {
    const [isRecording, setIsRecording] = useState(false)
    const [incidents, setIncidents] = useState<PostureIncident[]>([])
    const [currentPosture, setCurrentPosture] = useState<{
        isGood: boolean
        angle: number
        message: string
    } | null>(null)

    const addIncident = (incident: PostureIncident) => {
        setIncidents(prev => [incident, ...prev])
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-900 text-white">
            <div className="container mx-auto p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                        <Link href="/" className="text-2xl font-bold hover:text-blue-300 transition-colors">
                            ← PostureCheck
                        </Link>
                        <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`}></div>
                            <span className="text-sm font-medium">
                                {isRecording ? 'Recording' : 'Stopped'}
                            </span>
                        </div>
                    </div>

                    {currentPosture && (
                        <div className={`px-4 py-2 rounded-lg font-semibold ${currentPosture.isGood ? 'bg-green-600' : 'bg-red-600'
                            }`}>
                            {currentPosture.message} ({Math.round(currentPosture.angle)}°)
                        </div>
                    )}
                </div>

                {/* Main Content */}
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Video Stream */}
                    <div className="lg:col-span-2">
                        <div className="card">
                            <h2 className="text-xl font-semibold mb-4">Live Camera Feed</h2>
                            <VideoStream
                                onPostureUpdate={setCurrentPosture}
                                onIncident={addIncident}
                                isRecording={isRecording}
                                setIsRecording={setIsRecording}
                            />
                        </div>
                    </div>

                    {/* Incident Feed */}
                    <div className="lg:col-span-1">
                        <div className="card">
                            <h2 className="text-xl font-semibold mb-4">
                                Posture Incidents ({incidents.length})
                            </h2>
                            <IncidentFeed incidents={incidents} />
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid md:grid-cols-4 gap-4 mt-6">
                    <div className="card text-center">
                        <div className="text-2xl font-bold text-blue-400">{incidents.length}</div>
                        <div className="text-sm text-gray-300">Total Incidents</div>
                    </div>
                    <div className="card text-center">
                        <div className="text-2xl font-bold text-green-400">
                            {incidents.filter(i => i.duration < 10).length}
                        </div>
                        <div className="text-sm text-gray-300">Minor Issues</div>
                    </div>
                    <div className="card text-center">
                        <div className="text-2xl font-bold text-red-400">
                            {incidents.filter(i => i.duration >= 10).length}
                        </div>
                        <div className="text-sm text-gray-300">Major Issues</div>
                    </div>
                    <div className="card text-center">
                        <div className="text-2xl font-bold text-purple-400">
                            {currentPosture?.angle ? Math.round(currentPosture.angle) : '--'}°
                        </div>
                        <div className="text-sm text-gray-300">Current Angle</div>
                    </div>
                </div>
            </div>
        </div>
    )
} 