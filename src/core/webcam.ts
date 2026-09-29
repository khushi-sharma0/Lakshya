/**
 * Real Webcam Video Stream Module
 * Captures live webcam feed using navigator.mediaDevices.getUserMedia
 * Provides inline error handling and feeds frames into the detection/tracking pipeline.
 */

export class WebcamEngine {
  public videoElement: HTMLVideoElement;
  public stream: MediaStream | null = null;
  public isActive: boolean = false;
  public error: string | null = null;
  private canvasOffscreen: HTMLCanvasElement;
  private ctxOffscreen: CanvasRenderingContext2D;

  constructor() {
    this.videoElement = document.createElement('video');
    this.videoElement.playsInline = true;
    this.videoElement.muted = true;
    this.canvasOffscreen = document.createElement('canvas');
    this.ctxOffscreen = this.canvasOffscreen.getContext('2d', { willReadFrequently: true })!;
  }

  public async startWebcam(): Promise<boolean> {
    this.error = null;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API (getUserMedia) not supported in this browser environment.');
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      this.isActive = true;
      return true;
    } catch (err: any) {
      this.isActive = false;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.error = 'Camera permission was denied. Please allow camera access in browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        this.error = 'No physical webcam or video input device detected.';
      } else {
        this.error = err.message || 'Failed to initialize webcam stream.';
      }
      return false;
    }
  }

  public stopWebcam() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.videoElement.srcObject = null;
    this.isActive = false;
  }

  public extractFrame(): ImageData | null {
    if (!this.isActive || this.videoElement.readyState < 2) {
      return null;
    }

    const width = 640;
    const height = 480;
    this.canvasOffscreen.width = width;
    this.canvasOffscreen.height = height;

    this.ctxOffscreen.drawImage(this.videoElement, 0, 0, width, height);
    return this.ctxOffscreen.getImageData(0, 0, width, height);
  }
}
