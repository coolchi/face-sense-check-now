import { useEffect, useRef, useState } from 'react';
import { FaceDetection } from '@mediapipe/face_detection';
import { Camera } from '@mediapipe/camera_utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Camera as CameraIcon, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';

type FaceOrientation = 'straight' | 'left' | 'right' | 'none';

interface Detection {
  orientation: FaceOrientation;
  confidence: number;
  timestamp: number;
}

const LivenessDetector = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceDetectionRef = useRef<FaceDetection | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentOrientation, setCurrentOrientation] = useState<FaceOrientation>('none');
  const [confidence, setConfidence] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionHistory, setDetectionHistory] = useState<Detection[]>([]);
  const [error, setError] = useState<string | null>(null);

  const initializeMediaPipe = async () => {
    try {
      setError(null);
      
      const faceDetection = new FaceDetection({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
        }
      });

      faceDetection.setOptions({
        model: 'short',
        minDetectionConfidence: 0.5,
      });

      faceDetection.onResults((results) => {
        onResults(results);
      });

      faceDetectionRef.current = faceDetection;

      if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (faceDetectionRef.current && videoRef.current) {
              await faceDetectionRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480
        });

        cameraRef.current = camera;
        await camera.start();
        setIsInitialized(true);
        setIsDetecting(true);
      }
    } catch (err) {
      console.error('Error initializing MediaPipe:', err);
      setError('Failed to initialize camera and face detection. Please check your camera permissions.');
    }
  };

  const onResults = (results: any) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    if (videoRef.current) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    }

    if (results.detections && results.detections.length > 0) {
      const detection = results.detections[0];
      const landmarks = detection.landmarks;
      
      if (landmarks && landmarks.length >= 6) {
        // Calculate face orientation based on key landmarks
        const nose = landmarks[2]; // Nose tip
        const leftEye = landmarks[0]; // Left eye
        const rightEye = landmarks[1]; // Right eye
        
        // Ensure all required landmarks exist
        if (nose && leftEye && rightEye && nose.x !== undefined && leftEye.x !== undefined && rightEye.x !== undefined) {
          // Calculate horizontal position of nose relative to eye center
          const eyeCenter = (leftEye.x + rightEye.x) / 2;
          const noseX = nose.x;
          
          // Determine orientation based on nose position relative to eye center
          let orientation: FaceOrientation = 'straight';
          const threshold = 0.02; // Sensitivity threshold
          
          if (noseX < eyeCenter - threshold) {
            orientation = 'right'; // Person's right (our left when looking at them)
          } else if (noseX > eyeCenter + threshold) {
            orientation = 'left'; // Person's left (our right when looking at them)
          }
          
          const detectionConfidence = (detection.score && detection.score[0]) ? detection.score[0] : 0;
        
          setCurrentOrientation(orientation);
          setConfidence(detectionConfidence);
        
          // Add to detection history
          const newDetection: Detection = {
            orientation,
            confidence: detectionConfidence,
            timestamp: Date.now()
          };
          
          setDetectionHistory(prev => [...prev.slice(-9), newDetection]);
          
          // Draw face detection box
          const bbox = detection.boundingBox;
          if (bbox) {
            ctx.strokeStyle = orientation === 'straight' ? '#10b981' : '#3b82f6';
            ctx.lineWidth = 3;
            ctx.strokeRect(
              bbox.xCenter * canvas.width - (bbox.width * canvas.width) / 2,
              bbox.yCenter * canvas.height - (bbox.height * canvas.height) / 2,
              bbox.width * canvas.width,
              bbox.height * canvas.height
            );
          }
          
          // Draw landmarks
          ctx.fillStyle = '#ef4444';
          landmarks.forEach((landmark: any) => {
            ctx.beginPath();
            ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 3, 0, 2 * Math.PI);
            ctx.fill();
          });
        }
      }
    } else {
      setCurrentOrientation('none');
      setConfidence(0);
    }
  };

  const resetDetection = () => {
    setDetectionHistory([]);
    setCurrentOrientation('none');
    setConfidence(0);
  };

  const getOrientationColor = (orientation: FaceOrientation) => {
    switch (orientation) {
      case 'straight': return 'bg-success';
      case 'left': return 'bg-primary';
      case 'right': return 'bg-primary';
      default: return 'bg-muted';
    }
  };

  const getOrientationIcon = (orientation: FaceOrientation) => {
    switch (orientation) {
      case 'straight': return <CheckCircle className="w-4 h-4" />;
      case 'left': return <RotateCcw className="w-4 h-4 rotate-90" />;
      case 'right': return <RotateCcw className="w-4 h-4 -rotate-90" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  useEffect(() => {
    initializeMediaPipe();
    
    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Real-Time Liveness Detection
          </h1>
          <p className="text-muted-foreground">
            Look straight, left, or right to test face orientation detection
          </p>
        </div>

        {/* Main Detection Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera Feed */}
          <div className="lg:col-span-2">
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <CameraIcon className="w-5 h-5" />
                  Live Camera Feed
                </h2>
                <Badge 
                  variant={isDetecting ? "default" : "destructive"}
                  className={isDetecting ? "animate-pulse-glow" : ""}
                >
                  {isDetecting ? "Detecting" : "Stopped"}
                </Badge>
              </div>
              
              {error ? (
                <div className="flex flex-col items-center justify-center h-96 space-y-4">
                  <AlertCircle className="w-12 h-12 text-destructive" />
                  <p className="text-destructive text-center">{error}</p>
                  <Button onClick={initializeMediaPipe} variant="outline">
                    Retry Camera Access
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <video
                    ref={videoRef}
                    className="hidden"
                    autoPlay
                    muted
                    playsInline
                  />
                  <canvas
                    ref={canvasRef}
                    width={640}
                    height={480}
                    className="w-full h-auto rounded-lg border border-border shadow-lg"
                  />
                  
                  {/* Overlay Status */}
                  <div className="absolute top-4 left-4">
                    <Badge 
                      className={`${getOrientationColor(currentOrientation)} text-white flex items-center gap-2 animate-fade-in`}
                    >
                      {getOrientationIcon(currentOrientation)}
                      {currentOrientation === 'none' ? 'No Face' : `Looking ${currentOrientation}`}
                    </Badge>
                  </div>
                  
                  {/* Confidence Score */}
                  {confidence > 0 && (
                    <div className="absolute top-4 right-4">
                      <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">
                        Confidence: {(confidence * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Detection Status Panel */}
          <div className="space-y-4">
            {/* Current Status */}
            <Card className="p-4 space-y-4">
              <h3 className="font-semibold">Detection Status</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Orientation:</span>
                  <Badge className={getOrientationColor(currentOrientation)}>
                    {currentOrientation === 'none' ? 'No Face' : currentOrientation}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Confidence:</span>
                  <span className="text-sm font-mono">
                    {(confidence * 100).toFixed(1)}%
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Detections:</span>
                  <span className="text-sm font-mono">
                    {detectionHistory.length}
                  </span>
                </div>
              </div>
              
              <Button 
                onClick={resetDetection} 
                variant="outline" 
                size="sm" 
                className="w-full"
              >
                Reset History
              </Button>
            </Card>

            {/* Detection History */}
            <Card className="p-4 space-y-4">
              <h3 className="font-semibold">Recent Detections</h3>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {detectionHistory.slice(-10).reverse().map((detection, index) => (
                  <div 
                    key={`${detection.timestamp}-${index}`}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {getOrientationIcon(detection.orientation)}
                      <span className="capitalize">{detection.orientation}</span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {(detection.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
                
                {detectionHistory.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No detections yet
                  </p>
                )}
              </div>
            </Card>

            {/* Instructions */}
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold">Instructions</h3>
              
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span>Look straight ahead</span>
                </div>
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-primary rotate-90" />
                  <span>Turn your head left</span>
                </div>
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-primary -rotate-90" />
                  <span>Turn your head right</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LivenessDetector;