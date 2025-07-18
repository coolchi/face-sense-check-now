
import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Camera as CameraIcon, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';

type FaceOrientation = 'straight' | 'left' | 'right' | 'none';

interface Detection {
  orientation: FaceOrientation;
  confidence: number;
  timestamp: Date;
}

const LivenessDetector = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentOrientation, setCurrentOrientation] = useState<FaceOrientation>('none');
  const [confidence, setConfidence] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionHistory, setDetectionHistory] = useState<Detection[]>([]);
  const [error, setError] = useState<string | null>(null);

  const initializeCamera = async () => {
    try {
      setError(null);
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play();
            setIsInitialized(true);
            setIsDetecting(true);
            startDetection();
          }
        };
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Failed to access camera. Please check your camera permissions and try again.');
    }
  };

  const startDetection = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      detectFace();
    }, 100); // Detect every 100ms
  };

  const detectFace = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.videoWidth === 0) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Simple face detection using basic image processing
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const faceDetected = detectFaceInImageData(imageData, ctx);
    
    if (!faceDetected) {
      setCurrentOrientation('none');
      setConfidence(0);
    }
  };

  const detectFaceInImageData = (imageData: ImageData, ctx: CanvasRenderingContext2D): boolean => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // Simple face detection using skin color detection and edge detection
    let faceRegions: Array<{x: number, y: number, width: number, height: number}> = [];
    
    // Scan for skin-colored regions (simplified)
    const skinPixels: Array<{x: number, y: number}> = [];
    
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        
        // Simple skin color detection
        if (isSkinColor(r, g, b)) {
          skinPixels.push({x, y});
        }
      }
    }
    
    if (skinPixels.length > 100) { // Minimum threshold for face detection
      // Find the center of mass of skin pixels
      const centerX = skinPixels.reduce((sum, p) => sum + p.x, 0) / skinPixels.length;
      const centerY = skinPixels.reduce((sum, p) => sum + p.y, 0) / skinPixels.length;
      
      // Estimate face orientation based on asymmetry
      const leftSidePixels = skinPixels.filter(p => p.x < centerX).length;
      const rightSidePixels = skinPixels.filter(p => p.x > centerX).length;
      
      const asymmetryRatio = Math.abs(leftSidePixels - rightSidePixels) / (leftSidePixels + rightSidePixels);
      
      let orientation: FaceOrientation = 'straight';
      if (asymmetryRatio > 0.2) {
        if (leftSidePixels > rightSidePixels) {
          orientation = 'right'; // Face turned right
        } else {
          orientation = 'left'; // Face turned left
        }
      }
      
      const detectionConfidence = Math.min(skinPixels.length / 500, 1);
      
      setCurrentOrientation(orientation);
      setConfidence(detectionConfidence);
      
      // Add to detection history
      const newDetection: Detection = {
        orientation,
        confidence: detectionConfidence,
        timestamp: new Date()
      };
      
      setDetectionHistory(prev => [...prev.slice(-9), newDetection]);
      
      // Draw face detection indicator
      ctx.strokeStyle = orientation === 'straight' ? '#10b981' : '#3b82f6';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        centerX - 80,
        centerY - 80,
        160,
        160
      );
      
      // Draw center point
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      return true;
    }
    
    return false;
  };

  const isSkinColor = (r: number, g: number, b: number): boolean => {
    // Simple skin color detection algorithm
    const rg = r - g;
    const rb = r - b;
    const gb = g - b;
    
    return (
      r > 95 && g > 40 && b > 20 &&
      Math.max(r, Math.max(g, b)) - Math.min(r, Math.min(g, b)) > 15 &&
      Math.abs(rg) > 15 && r > g && r > b
    ) || (
      r > 220 && g > 210 && b > 170 &&
      Math.abs(rg) <= 15 && r > b && g > b
    );
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
    initializeCamera();
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
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
                  <Button onClick={initializeCamera} variant="outline">
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
                    key={`${detection.timestamp.getTime()}-${index}`}
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
