import numpy as np

def calculate_angle(a, b, c):
    """Calculate angle at point b given three 2D points a, b, c"""
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)
    
    ba = a - b
    bc = c - b
    
    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc))
    angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))
    return np.degrees(angle)

def check_lifting_posture(pose_landmarks, threshold=150):
    """
    Check if the lifting posture is good based on knee bend and body position.
    
    Args:
        pose_landmarks: MediaPipe pose landmarks object
        threshold: Knee angle threshold in degrees (default: 150)
    
    Returns:
        tuple: (is_good_posture: bool, knee_angle: float, message: str)
               Returns (None, None, error_message) if detection fails
    """
    try:
        # Extract landmarks
        landmarks = pose_landmarks.landmark
        
        def get_point(landmark_id):
            lm = landmarks[landmark_id]
            return [lm.x, lm.y]
        
        # Get points for both legs using MediaPipe landmark IDs
        left_hip = get_point(23)    # LEFT_HIP
        left_knee = get_point(25)   # LEFT_KNEE
        left_ankle = get_point(27)  # LEFT_ANKLE
        
        right_hip = get_point(24)   # RIGHT_HIP
        right_knee = get_point(26)  # RIGHT_KNEE
        right_ankle = get_point(28) # RIGHT_ANKLE
        
        # Get upper body points for bend detection
        left_shoulder = get_point(11)   # LEFT_SHOULDER
        right_shoulder = get_point(12)  # RIGHT_SHOULDER
        nose = get_point(0)             # NOSE
        
        # Calculate knee angles for both legs
        left_knee_angle = calculate_angle(left_hip, left_knee, left_ankle)
        right_knee_angle = calculate_angle(right_hip, right_knee, right_ankle)
        avg_knee_angle = (left_knee_angle + right_knee_angle) / 2
        
        # Calculate if person is bending forward
        avg_shoulder_y = (left_shoulder[1] + right_shoulder[1]) / 2
        avg_hip_y = (left_hip[1] + right_hip[1]) / 2
        nose_y = nose[1]
        
        # Check forward bend indicators (loosened criteria)
        shoulder_hip_distance = avg_hip_y - avg_shoulder_y
        nose_shoulder_distance = nose_y - avg_shoulder_y
        
        # Reduced threshold from 0.5 to 0.3 - more sensitive to forward bend
        is_bending_forward = nose_shoulder_distance > shoulder_hip_distance * 0.3
        
        # Alternative check: if nose is below shoulder level
        is_head_low = nose_y > avg_shoulder_y + 0.05  # Small margin for normal standing
        
        # Check if torso is tilted (shoulder to hip angle)
        torso_vertical_offset = abs((left_shoulder[0] + right_shoulder[0]) / 2 - 
                                   (left_hip[0] + right_hip[0]) / 2)
        is_torso_tilted = torso_vertical_offset > 0.08  # Reduced from implicit check
        
        # Combine all bending indicators - person is likely lifting if ANY are true
        is_attempting_lift = is_bending_forward or is_head_low or is_torso_tilted
        
        # Determine posture status based on context
        if avg_knee_angle > 165:  # Reduced from 170 - slightly bent knees still count as "straight"
            if is_attempting_lift:
                # Person is bending to pick something with straight legs - BAD
                is_good_posture = False
                message = "Bad posture - Bend your knees when lifting!"
            else:
                # Person is just standing upright - GOOD
                is_good_posture = True
                message = "Good posture - Standing upright"
        elif avg_knee_angle < threshold:
            # Knees are bent properly
            is_good_posture = True
            if is_attempting_lift:
                # Person is squatting/lifting properly - GOOD
                message = "Good posture - Proper squatting technique"
            else:
                # Just standing with bent knees - GOOD
                message = "Good posture - Knees bent"
        else:
            # Knees partially bent (between threshold and 165)
            if is_attempting_lift:
                is_good_posture = False
                message = "Bad posture - Bend knees more when lifting"
            else:
                is_good_posture = True
                message = "Good posture"
        
        return is_good_posture, avg_knee_angle, message
        
    except Exception as e:
        return None, None, f"Error detecting posture: {str(e)}"

""" Code to use the function with MediaPipe Pose
import cv2
import mediapipe as mp

mp_pose = mp.solutions.pose
pose = mp_pose.Pose()
mp_drawing = mp.solutions.drawing_utils

cap = cv2.VideoCapture(0)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(image)
    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    
    if results.pose_landmarks:
        # Draw pose landmarks
        mp_drawing.draw_landmarks(image, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)
        
        # Call the function
        is_good, angle, message = check_lifting_posture(results.pose_landmarks)
        
        if is_good is not None:
            # Use the results
            color = (0, 255, 0) if is_good else (0, 0, 255)
            cv2.putText(image, f'Knee Angle: {int(angle)}', (30, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 0), 2)
            cv2.putText(image, message, (30, 100),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
    
    cv2.imshow('Posture Check', image)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
"""