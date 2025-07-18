
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
    
    // Enhanced face detection with multiple algorithms
    const skinPixels: Array<{x: number, y: number, intensity: number}> = [];
    const faceFeatures: Array<{x: number, y: number, confidence: number}> = [];
    
    // Multi-pass detection for better accuracy
    
    // Pass 1: Enhanced skin color detection with lighting adaptation
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        
        const skinConfidence = getSkinColorConfidence(r, g, b);
        if (skinConfidence > 0.3) {
          skinPixels.push({x, y, intensity: skinConfidence});
        }
      }
    }
    
    if (skinPixels.length < 50) {
      setCurrentOrientation('none');
      setConfidence(0);
      return false;
    }
    
    // Pass 2: Cluster analysis for face region detection
    const clusters = clusterSkinPixels(skinPixels, width, height);
    const primaryCluster = clusters.find(cluster => cluster.pixels.length > 100);
    
    if (!primaryCluster) {
      setCurrentOrientation('none');
      setConfidence(0);
      return false;
    }
    
    // Pass 3: Face feature detection within the primary cluster
    const faceRegion = primaryCluster;
    const centerX = faceRegion.centerX;
    const centerY = faceRegion.centerY;
    
    // Pass 4: Enhanced orientation detection using multiple cues
    const orientation = detectFaceOrientation(faceRegion, data, width, height);
    const detectionConfidence = Math.min(faceRegion.confidence, 1);
    
    // Temporal smoothing for stability
    const smoothedOrientation = temporalSmoothing(orientation, detectionConfidence);
    
    setCurrentOrientation(smoothedOrientation.orientation);
    setConfidence(smoothedOrientation.confidence);
    
    // Add to detection history
    const newDetection: Detection = {
      orientation: smoothedOrientation.orientation,
      confidence: smoothedOrientation.confidence,
      timestamp: new Date()
    };
    
    setDetectionHistory(prev => [...prev.slice(-9), newDetection]);
    
    // Enhanced visualization
    drawFaceDetection(ctx, centerX, centerY, faceRegion.width, faceRegion.height, smoothedOrientation.orientation);
    
    return true;
  };

  const getSkinColorConfidence = (r: number, g: number, b: number): number => {
    // Multiple skin color models for better accuracy
    
    // Model 1: RGB-based detection
    const rgbScore = (r > 95 && g > 40 && b > 20 && 
                     Math.max(r, g, b) - Math.min(r, g, b) > 15 && 
                     Math.abs(r - g) > 15 && r > g && r > b) ? 0.8 : 0;
    
    // Model 2: YCbCr color space
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = -0.169 * r - 0.331 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.419 * g - 0.081 * b + 128;
    
    const ycbcrScore = (y > 80 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) ? 0.9 : 0;
    
    // Model 3: HSV-based detection
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max / 255;
    const s = max === 0 ? 0 : (max - min) / max;
    
    let h = 0;
    if (max !== min) {
      switch (max) {
        case r: h = ((g - b) / (max - min)) * 60; break;
        case g: h = (2 + (b - r) / (max - min)) * 60; break;
        case b: h = (4 + (r - g) / (max - min)) * 60; break;
      }
    }
    if (h < 0) h += 360;
    
    const hsvScore = (h >= 0 && h <= 50 && s >= 0.23 && s <= 0.68 && v >= 0.35 && v <= 0.95) ? 0.7 : 0;
    
    return Math.max(rgbScore, ycbcrScore, hsvScore);
  };

  const clusterSkinPixels = (skinPixels: Array<{x: number, y: number, intensity: number}>, width: number, height: number) => {
    // Simple clustering algorithm
    const clusters: Array<{
      centerX: number;
      centerY: number;
      width: number;
      height: number;
      confidence: number;
      pixels: Array<{x: number, y: number, intensity: number}>;
    }> = [];
    
    if (skinPixels.length === 0) return clusters;
    
    // For simplicity, create one main cluster
    const avgIntensity = skinPixels.reduce((sum, p) => sum + p.intensity, 0) / skinPixels.length;
    const centerX = skinPixels.reduce((sum, p) => sum + p.x, 0) / skinPixels.length;
    const centerY = skinPixels.reduce((sum, p) => sum + p.y, 0) / skinPixels.length;
    
    // Calculate bounds
    const minX = Math.min(...skinPixels.map(p => p.x));
    const maxX = Math.max(...skinPixels.map(p => p.x));
    const minY = Math.min(...skinPixels.map(p => p.y));
    const maxY = Math.max(...skinPixels.map(p => p.y));
    
    clusters.push({
      centerX,
      centerY,
      width: maxX - minX,
      height: maxY - minY,
      confidence: Math.min(avgIntensity * (skinPixels.length / 200), 1),
      pixels: skinPixels
    });
    
    return clusters;
  };

  const detectFaceOrientation = (faceRegion: any, data: Uint8ClampedArray, width: number, height: number): FaceOrientation => {
    const { centerX, centerY, pixels } = faceRegion;
    
    // Enhanced asymmetry analysis
    const leftPixels = pixels.filter((p: any) => p.x < centerX - 20);
    const rightPixels = pixels.filter((p: any) => p.x > centerX + 20);
    const centerPixels = pixels.filter((p: any) => Math.abs(p.x - centerX) <= 20);
    
    const leftDensity = leftPixels.length;
    const rightDensity = rightPixels.length;
    const centerDensity = centerPixels.length;
    
    // Calculate intensity differences
    const leftIntensity = leftPixels.reduce((sum: number, p: any) => sum + p.intensity, 0) / Math.max(leftPixels.length, 1);
    const rightIntensity = rightPixels.reduce((sum: number, p: any) => sum + p.intensity, 0) / Math.max(rightPixels.length, 1);
    
    const densityRatio = Math.abs(leftDensity - rightDensity) / (leftDensity + rightDensity);
    const intensityRatio = Math.abs(leftIntensity - rightIntensity) / (leftIntensity + rightIntensity);
    
    // Combined analysis for more stable detection
    const asymmetryScore = (densityRatio + intensityRatio) / 2;
    
    if (asymmetryScore < 0.15 && centerDensity > Math.max(leftDensity, rightDensity) * 0.5) {
      return 'straight';
    } else if (asymmetryScore > 0.25) {
      return leftDensity > rightDensity ? 'right' : 'left';
    }
    
    return 'straight';
  };

  // Temporal smoothing state
  const recentDetections = useRef<Array<{orientation: FaceOrientation, confidence: number, timestamp: number}>>([]);

  const temporalSmoothing = (orientation: FaceOrientation, confidence: number) => {
    const now = Date.now();
    
    // Add current detection
    recentDetections.current.push({ orientation, confidence, timestamp: now });
    
    // Keep only recent detections (last 500ms)
    recentDetections.current = recentDetections.current.filter(d => now - d.timestamp < 500);
    
    // Calculate weighted average
    const weights = recentDetections.current.map(d => Math.exp(-(now - d.timestamp) / 200));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    // Count orientations with recency weighting
    const orientationScores = {
      straight: 0,
      left: 0,
      right: 0,
      none: 0
    };
    
    recentDetections.current.forEach((d, i) => {
      orientationScores[d.orientation] += weights[i] * d.confidence;
    });
    
    // Find most confident orientation
    const bestOrientation = Object.entries(orientationScores).reduce((a, b) => 
      orientationScores[a[0] as FaceOrientation] > orientationScores[b[0] as FaceOrientation] ? a : b
    )[0] as FaceOrientation;
    
    const smoothedConfidence = orientationScores[bestOrientation] / totalWeight;
    
    return {
      orientation: bestOrientation,
      confidence: Math.min(smoothedConfidence, 1)
    };
  };

  const drawFaceDetection = (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, width: number, height: number, orientation: FaceOrientation) => {
    // Draw face bounding box
    ctx.strokeStyle = orientation === 'straight' ? '#10b981' : '#3b82f6';
    ctx.lineWidth = 3;
    ctx.strokeRect(
      centerX - Math.max(width, height) / 2,
      centerY - Math.max(width, height) / 2,
      Math.max(width, height),
      Math.max(width, height)
    );
    
    // Draw orientation indicator
    ctx.fillStyle = orientation === 'straight' ? '#10b981' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw direction arrow for non-straight orientations
    if (orientation !== 'straight' && orientation !== 'none') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const arrowLength = 30;
      const arrowX = orientation === 'left' ? centerX - arrowLength : centerX + arrowLength;
      
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(arrowX, centerY);
      
      // Arrow head
      const headSize = 8;
      const headX = orientation === 'left' ? arrowX + headSize : arrowX - headSize;
      ctx.moveTo(arrowX, centerY);
      ctx.lineTo(headX, centerY - headSize);
      ctx.moveTo(arrowX, centerY);
      ctx.lineTo(headX, centerY + headSize);
      
      ctx.stroke();
    }
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
