'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
    return (
        <div className="min-h-screen bg-depot-dark text-white">
            <div className="container mx-auto max-w-7xl px-6 py-16">
                {/* Logo Section */}
                <div className="text-center mb-20">
                    <div className="flex justify-center mb-8">
                        <Image
                            src="/logo.png"
                            alt="PostureCheck Logo"
                            width={200}
                            height={200}
                            className="drop-shadow-2xl"
                            priority
                        />
                    </div>
                    <h1 className="text-6xl md:text-7xl font-bold text-white mb-4 tracking-tight">
                        PostureCheck
                    </h1>
                    <div className="w-48 h-1.5 bg-depot-orange mx-auto rounded-full shadow-lg"></div>
                </div>

                {/* Main Content Card */}
                <div className="max-w-4xl mx-auto mb-20">
                    <div className="card text-center">
                        <h2 className="text-4xl font-bold mb-8 text-depot-orange">
                            AI-Powered Posture Monitoring
                        </h2>

                        <div className="text-xl text-gray-300 mb-10 leading-relaxed max-w-3xl mx-auto">
                            <p className="mb-6">
                                Good posture is essential for your health and well-being. Poor posture can lead to:
                            </p>
                            <div className="grid md:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
                                <div className="flex items-center space-x-3">
                                    <span className="text-depot-orange text-2xl font-bold">•</span>
                                    <span>Back and neck pain</span>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <span className="text-depot-orange text-2xl font-bold">•</span>
                                    <span>Reduced lung capacity</span>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <span className="text-depot-orange text-2xl font-bold">•</span>
                                    <span>Muscle fatigue and tension</span>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <span className="text-depot-orange text-2xl font-bold">•</span>
                                    <span>Long-term spinal problems</span>
                                </div>
                            </div>
                        </div>

                        <div className="mb-10">
                            <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
                                Our AI monitors your posture in real-time, especially when lifting heavy objects,
                                and alerts you to maintain proper form for workplace safety compliance.
                            </p>
                        </div>

                        <Link href="/video" className="inline-block">
                            <button className="btn text-2xl px-12 py-5 shadow-2xl hover:shadow-depot-orange/25 transition-all duration-300">
                                🎥 Start Recording
                            </button>
                        </Link>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    <div className="card text-center group hover:scale-105 transition-transform duration-300">
                        <div className="text-6xl mb-6 group-hover:scale-110 transition-transform duration-300">🏋️</div>
                        <h3 className="text-2xl font-bold mb-4 text-depot-orange">Smart Detection</h3>
                        <p className="text-gray-400 leading-relaxed">
                            Automatically detects when you're carrying heavy items and monitors your lifting technique
                        </p>
                    </div>
                    <div className="card text-center group hover:scale-105 transition-transform duration-300">
                        <div className="text-6xl mb-6 group-hover:scale-110 transition-transform duration-300">🤖</div>
                        <h3 className="text-2xl font-bold mb-4 text-depot-orange">Real-time Analysis</h3>
                        <p className="text-gray-400 leading-relaxed">
                            Instant posture feedback with AI-powered analysis for immediate corrections
                        </p>
                    </div>
                    <div className="card text-center group hover:scale-105 transition-transform duration-300">
                        <div className="text-6xl mb-6 group-hover:scale-110 transition-transform duration-300">📼</div>
                        <h3 className="text-2xl font-bold mb-4 text-depot-orange">Incident Recording</h3>
                        <p className="text-gray-400 leading-relaxed">
                            Records and replays posture incidents for review and compliance documentation
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
} 