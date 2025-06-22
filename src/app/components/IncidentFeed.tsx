'use client'

import { useState } from 'react'
import { PostureIncident } from '../video/page'

interface IncidentFeedProps {
    incidents: PostureIncident[]
}

export default function IncidentFeed({ incidents }: IncidentFeedProps) {
    const [selectedIncident, setSelectedIncident] = useState<PostureIncident | null>(null)

    const formatDuration = (seconds: number) => {
        return `${seconds.toFixed(1)}s`
    }

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString()
    }

    const playIncident = (incident: PostureIncident) => {
        setSelectedIncident(incident)
    }

    const closePlayer = () => {
        setSelectedIncident(null)
    }

    if (incidents.length === 0) {
        return (
            <div className="incident-feed">
                <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-4">👍</div>
                    <div className="text-lg font-medium mb-2">No incidents detected</div>
                    <div className="text-sm">Great posture so far!</div>
                </div>
            </div>
        )
    }

    return (
        <>
            <div className="incident-feed">
                <div className="space-y-3">
                    {incidents.map((incident) => (
                        <div key={incident.id} className="incident-item">
                            <div className="incident-time">
                                {formatTime(incident.timestamp)}
                            </div>
                            <div className="flex justify-between items-center mb-2">
                                <div className="font-medium text-red-300">
                                    Bad Posture Detected
                                </div>
                                <div className="text-sm text-gray-300">
                                    {formatDuration(incident.duration)}
                                </div>
                            </div>
                            <div className="text-sm text-gray-400 mb-3">
                                Knee angle: {Math.round(incident.kneeAngle)}°
                            </div>
                            {incident.videoBlob && (
                                <button
                                    onClick={() => playIncident(incident)}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center space-x-2"
                                >
                                    <span>▶️</span>
                                    <span>Play Recording</span>
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Video Player Modal */}
            {selectedIncident && selectedIncident.videoBlob && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
                        <div className="flex justify-between items-center p-4 border-b border-gray-700">
                            <div>
                                <h3 className="text-lg font-semibold text-white">
                                    Incident Recording
                                </h3>
                                <div className="text-sm text-gray-400">
                                    {formatTime(selectedIncident.timestamp)} • {formatDuration(selectedIncident.duration)}
                                </div>
                            </div>
                            <button
                                onClick={closePlayer}
                                className="text-gray-400 hover:text-white text-2xl"
                            >
                                ×
                            </button>
                        </div>
                        <div className="p-4">
                            <video
                                controls
                                autoPlay
                                className="w-full rounded-lg"
                                src={URL.createObjectURL(selectedIncident.videoBlob)}
                            />
                            <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                                <div className="text-red-300 font-medium">Posture Issue Details</div>
                                <div className="text-sm text-gray-300 mt-1">
                                    Duration: {formatDuration(selectedIncident.duration)}
                                </div>
                                <div className="text-sm text-gray-300">
                                    Knee Angle: {Math.round(selectedIncident.kneeAngle)}°
                                </div>
                                <div className="text-sm text-gray-300">
                                    Message: {selectedIncident.message}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
} 