from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import cv2
import mediapipe as mp
import numpy as np
import tempfile
import os
import base64
import threading
import time
from posture_check import check_lifting_posture
from image_analysis import ImageAnalysis

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize MediaPipe Pose
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# Two pose instances - one for static images, one for video
pose_static = mp_pose.Pose(
    static_image_mode=True,
    model_complexity=2,
    enable_segmentation=False,
    min_detection_confidence=0.5,
)

pose_video = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=0,  # Fastest model for real-time processing
    enable_segmentation=False,
    min_detection_confidence=0.3,  # Lower threshold for faster detection
    min_tracking_confidence=0.3,  # Lower threshold for faster tracking
)

# Global variables for video streaming
current_frame = None
frame_lock = threading.Lock()
latest_posture_data = {"isGood": True, "angle": 180, "message": "No pose detected"}
debug_mode = True  # Enable debug mode by default
frame_skip_counter = 0  # For optimizing processing
# Add a default black frame for when no frame is available
default_frame = None


@app.route("/api/posture-check", methods=["POST"])
def posture_check():
    try:
        # Get image from request
        if "image" not in request.files:
            return jsonify({"error": "No image provided"}), 400

        file = request.files["image"]
        if file.filename == "":
            return jsonify({"error": "No image selected"}), 400

        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
            file.save(tmp_file.name)
            image_path = tmp_file.name

        try:
            # Read and process image
            image = cv2.imread(image_path)
            if image is None:
                return jsonify({"error": "Could not read image"}), 400

            # Convert BGR to RGB
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            # Process the image
            results = pose_static.process(image_rgb)

            if results.pose_landmarks:
                # Call our posture checking function
                # Draw pose landmarks
                mp_drawing.draw_landmarks(
                    image, results.pose_landmarks, mp_pose.POSE_CONNECTIONS
                )
                is_good, angle, message = check_lifting_posture(results.pose_landmarks)

                if is_good is not None:
                    result = {
                        "isGood": is_good,
                        "angle": float(angle),
                        "message": message,
                        "landmarks_detected": True,
                    }
                else:
                    result = {"error": message, "landmarks_detected": True}
            else:
                result = {
                    "error": "No pose landmarks detected",
                    "landmarks_detected": False,
                }

            return jsonify(result)

        finally:
            # Clean up temporary file
            try:
                os.unlink(image_path)
            except:
                pass

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/image-analysis", methods=["POST"])
def image_analysis():
    try:
        # Get image from request
        if "image" not in request.files:
            return jsonify({"error": "No image provided"}), 400

        file = request.files["image"]
        if file.filename == "":
            return jsonify({"error": "No image selected"}), 400

        # Check if GOOGLE_API_KEY is available
        if not os.getenv("GOOGLE_API_KEY"):
            return jsonify(
                {
                    "items": [],
                    "person_detected": False,
                    "analysis_notes": "Google API key not configured - skipping image analysis",
                    "error": "API key missing",
                }
            )

        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
            file.save(tmp_file.name)
            image_path = tmp_file.name

        try:
            # Use existing image analysis
            analyzer = ImageAnalysis(image_path, os.getenv("GOOGLE_API_KEY"))
            result = analyzer.analyze()
            return jsonify(result)

        finally:
            # Clean up temporary file
            try:
                os.unlink(image_path)
            except:
                pass

    except Exception as e:
        return jsonify(
            {
                "items": [],
                "person_detected": False,
                "analysis_notes": f"Error: {str(e)}",
                "error": str(e),
            }
        )


@app.route("/api/video-stream")
def video_stream():
    """Stream processed video with MediaPipe pose overlay"""
    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.route("/api/upload-frame", methods=["POST"])
def upload_frame():
    """Receive frame from frontend for processing"""
    try:
        if "frame" not in request.files:
            return jsonify({"error": "No frame provided"}), 400

        file = request.files["frame"]
        if file.filename == "":
            return jsonify({"error": "No frame selected"}), 400

        # Read the frame
        file_bytes = np.frombuffer(file.read(), np.uint8)
        frame = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({"error": "Could not decode frame"}), 400

        # Process and store the frame globally
        process_and_store_frame(frame)

        return jsonify({"status": "success", "frame_count": frame_skip_counter})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/current-posture", methods=["GET"])
def get_current_posture():
    """Get current posture data"""
    return jsonify(latest_posture_data)


@app.route("/api/debug-toggle", methods=["POST"])
def toggle_debug():
    """Toggle debug mode for skeleton visualization"""
    global debug_mode
    debug_mode = not debug_mode
    return jsonify(
        {
            "debug_mode": debug_mode,
            "message": f"Debug mode {'enabled' if debug_mode else 'disabled'}",
        }
    )


@app.route("/api/debug-status", methods=["GET"])
def get_debug_status():
    """Get current debug mode status"""
    return jsonify({"debug_mode": debug_mode})


@app.route("/api/current-frame")
def get_current_frame():
    """Get current processed frame as JPEG"""
    global current_frame, default_frame

    frame_to_send = None

    try:
        # Try to get current frame with timeout
        if frame_lock.acquire(timeout=0.01):  # 10ms timeout
            try:
                if current_frame is not None:
                    frame_to_send = current_frame.copy()
                else:
                    # Use default frame if no current frame
                    if default_frame is None:
                        default_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                        cv2.putText(
                            default_frame,
                            "Waiting for camera...",
                            (150, 240),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            1,
                            (255, 255, 255),
                            2,
                        )
                    frame_to_send = default_frame.copy()
            finally:
                frame_lock.release()
        else:
            # If can't acquire lock, return error
            return jsonify({"error": "Frame not available"}), 503

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if frame_to_send is not None:
        try:
            # Encode frame as JPEG
            ret, buffer = cv2.imencode(
                ".jpg", frame_to_send, [cv2.IMWRITE_JPEG_QUALITY, 80]
            )
            if ret:
                response = Response(
                    buffer.tobytes(),
                    mimetype="image/jpeg",
                    headers={
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        "Pragma": "no-cache",
                        "Expires": "0",
                    },
                )
                return response
            else:
                return jsonify({"error": "Failed to encode frame"}), 500
        except Exception as e:
            return jsonify({"error": f"Encoding error: {str(e)}"}), 500
    else:
        return jsonify({"error": "No frame available"}), 404


def process_and_store_frame(frame):
    """Process frame with MediaPipe and store globally"""
    global current_frame, latest_posture_data, frame_skip_counter

    try:
        # Increment frame counter
        frame_skip_counter += 1

        # Skip processing every few frames for performance if needed
        # Only process every other frame for better performance
        if frame_skip_counter % 2 == 0:
            # Still store the raw frame to keep stream going
            try:
                if frame_lock.acquire(timeout=0.005):
                    try:
                        current_frame = frame.copy()
                    finally:
                        frame_lock.release()
            except:
                pass
            return

        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Process with MediaPipe
        results = pose_video.process(rgb_frame)

        # Convert back to BGR for OpenCV
        annotated_frame = cv2.cvtColor(rgb_frame, cv2.COLOR_RGB2BGR)

        # Draw pose landmarks
        if results.pose_landmarks:
            # Custom drawing specifications for better visibility
            landmark_drawing_spec = mp_drawing.DrawingSpec(
                color=(0, 255, 0),  # Green landmarks
                thickness=6,
                circle_radius=8,
            )
            connection_drawing_spec = mp_drawing.DrawingSpec(
                color=(255, 0, 255),  # Magenta connections
                thickness=4,
                circle_radius=2,
            )

            # Draw the pose landmarks with custom specs
            mp_drawing.draw_landmarks(
                annotated_frame,
                results.pose_landmarks,
                mp_pose.POSE_CONNECTIONS,
                landmark_drawing_spec=landmark_drawing_spec,
                connection_drawing_spec=connection_drawing_spec,
            )

            # Draw landmark indices for debugging (key points only) - only if debug mode is on
            # Skip detailed debug drawing every few frames for performance
            if (
                debug_mode and frame_skip_counter % 2 == 0
            ):  # Draw debug info every other frame
                debug_landmarks = [
                    (23, "L_HIP"),
                    (24, "R_HIP"),
                    (25, "L_KNEE"),
                    (26, "R_KNEE"),
                    (27, "L_ANKLE"),
                    (28, "R_ANKLE"),
                    (11, "L_SHOULDER"),
                    (12, "R_SHOULDER"),
                    (13, "L_ELBOW"),
                    (14, "R_ELBOW"),
                    (15, "L_WRIST"),
                    (16, "R_WRIST"),
                    (0, "NOSE"),
                    (9, "L_EAR"),
                    (10, "R_EAR"),
                ]

                h, w, _ = annotated_frame.shape
                for idx, label in debug_landmarks:
                    if idx < len(results.pose_landmarks.landmark):
                        landmark = results.pose_landmarks.landmark[idx]
                        x = int(landmark.x * w)
                        y = int(landmark.y * h)

                        # Draw landmark index and label with background
                        text = f"{idx}:{label}"
                        text_size = cv2.getTextSize(
                            text, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1
                        )[0]
                        cv2.rectangle(
                            annotated_frame,
                            (x + 10, y - 15),
                            (x + 15 + text_size[0], y + 5),
                            (0, 0, 0),
                            -1,
                        )
                        cv2.putText(
                            annotated_frame,
                            text,
                            (x + 12, y - 5),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.4,
                            (255, 255, 0),
                            1,
                        )

            # Check posture
            is_good, angle, message = check_lifting_posture(results.pose_landmarks)

            if is_good is not None:
                latest_posture_data = {
                    "isGood": bool(is_good),  # Convert NumPy bool to Python bool
                    "angle": float(angle),
                    "message": str(message),
                    "landmarks_detected": True,
                }

                # Add posture info overlay with better visibility
                color = (0, 255, 0) if is_good else (0, 0, 255)

                # Add background rectangle for better text readability
                cv2.rectangle(annotated_frame, (20, 20), (400, 120), (0, 0, 0), -1)
                cv2.rectangle(annotated_frame, (20, 20), (400, 120), (255, 255, 255), 2)

                cv2.putText(
                    annotated_frame,
                    f"Knee Angle: {int(angle)}°",
                    (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 255, 255),  # Cyan for angle
                    2,
                )
                cv2.putText(
                    annotated_frame,
                    message,
                    (30, 80),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    color,
                    2,
                )
                cv2.putText(
                    annotated_frame,
                    f"Landmarks: {len(results.pose_landmarks.landmark)}",
                    (30, 110),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (255, 255, 255),
                    1,
                )

                # Add debug info about key angles (only if debug mode is on)
                if debug_mode:
                    landmarks = results.pose_landmarks.landmark
                    if len(landmarks) > 28:
                        left_hip = landmarks[23]
                        left_knee = landmarks[25]
                        left_ankle = landmarks[27]
                        right_hip = landmarks[24]
                        right_knee = landmarks[26]
                        right_ankle = landmarks[28]

                        # Show landmark coordinates for debugging
                        debug_info = [
                            f"L_KNEE: ({left_knee.x:.2f}, {left_knee.y:.2f})",
                            f"R_KNEE: ({right_knee.x:.2f}, {right_knee.y:.2f})",
                            f"Visibility: L={left_knee.visibility:.2f} R={right_knee.visibility:.2f}",
                            f"DEBUG MODE: ON | FPS: 24 | Frame: {frame_skip_counter}",
                        ]

                        for i, info in enumerate(debug_info):
                            cv2.putText(
                                annotated_frame,
                                info,
                                (420, 50 + i * 25),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.5,
                                (255, 255, 255),
                                1,
                            )
            else:
                latest_posture_data = {
                    "error": str(message),
                    "landmarks_detected": True,
                }
        else:
            latest_posture_data = {
                "error": "No pose landmarks detected",
                "landmarks_detected": False,
            }
            # Add background rectangle for error message
            cv2.rectangle(annotated_frame, (20, 20), (350, 80), (0, 0, 0), -1)
            cv2.rectangle(annotated_frame, (20, 20), (350, 80), (0, 0, 255), 2)

            cv2.putText(
                annotated_frame,
                "No pose detected",
                (30, 50),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 0, 255),
                2,
            )

        # Store the processed frame - minimize lock time
        processed_frame = annotated_frame.copy()
        try:
            if frame_lock.acquire(
                timeout=0.005
            ):  # 5ms timeout to prevent blocking stream
                try:
                    current_frame = processed_frame
                finally:
                    frame_lock.release()
            else:
                print("Frame lock timeout - skipping frame update")
        except Exception as lock_error:
            print(f"Error acquiring frame lock: {lock_error}")

    except Exception as e:
        print(f"Error processing frame: {e}")
        # Store an error frame so the stream doesn't freeze
        try:
            error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(
                error_frame,
                "Processing Error",
                (200, 240),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 0, 255),
                2,
            )
            if frame_lock.acquire(timeout=0.005):
                try:
                    current_frame = error_frame
                finally:
                    frame_lock.release()
        except:
            pass  # If error frame also fails, just continue


def generate_frames():
    """Generate frames for video streaming"""
    global current_frame, default_frame

    # Initialize default frame if not set
    if default_frame is None:
        default_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        # Add "Waiting for camera..." text to default frame
        cv2.putText(
            default_frame,
            "Waiting for camera...",
            (150, 240),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (255, 255, 255),
            2,
        )

    while True:
        frame_to_send = None

        # Try to get current frame with timeout to prevent blocking
        try:
            # Use timeout to prevent indefinite blocking
            if frame_lock.acquire(timeout=0.01):  # 10ms timeout
                try:
                    if current_frame is not None:
                        frame_to_send = current_frame.copy()
                    else:
                        frame_to_send = default_frame.copy()
                finally:
                    frame_lock.release()
            else:
                # If can't acquire lock, use default frame
                frame_to_send = default_frame.copy()

        except Exception as e:
            print(f"Error accessing frame: {e}")
            frame_to_send = default_frame.copy()

        # Encode and send frame
        try:
            if frame_to_send is not None:
                ret, buffer = cv2.imencode(
                    ".jpg", frame_to_send, [cv2.IMWRITE_JPEG_QUALITY, 75]
                )
                if ret:
                    frame_bytes = buffer.tobytes()
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
                    )
                else:
                    print("Failed to encode frame")

        except Exception as e:
            print(f"Error in frame generation: {e}")
            # Yield a minimal error frame
            try:
                error_frame = np.zeros((240, 320, 3), dtype=np.uint8)
                cv2.putText(
                    error_frame,
                    "Stream Error",
                    (50, 120),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,
                    (0, 0, 255),
                    2,
                )
                ret, buffer = cv2.imencode(
                    ".jpg", error_frame, [cv2.IMWRITE_JPEG_QUALITY, 50]
                )
                if ret:
                    frame_bytes = buffer.tobytes()
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
                    )
            except:
                pass  # If even error frame fails, continue loop

        time.sleep(0.042)  # ~24 FPS


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy"})


if __name__ == "__main__":
    print("Starting Posture Check Backend Server...")
    print(
        "Make sure you have set the GOOGLE_API_KEY environment variable for image analysis"
    )
    app.run(host="0.0.0.0", port=5001, debug=True)
