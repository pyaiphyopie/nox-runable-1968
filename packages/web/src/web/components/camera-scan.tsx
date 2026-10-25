import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Action, Kicker, Notice } from "./nox";

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
}

/**
 * Camera scanning where the browser can actually do it (BarcodeDetector, Chrome on
 * Android). Where it cannot, the component says so instead of pretending — the manual
 * token field on the door page is always the fallback.
 */
export function CameraScan({ onDetect }: { onDetect: (value: string) => void }) {
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike })
          .BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });

        const tick = async () => {
          if (cancelled || detectedRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current as HTMLVideoElement);
            if (codes.length && codes[0].rawValue) {
              detectedRef.current = true;
              onDetect(codes[0].rawValue);
              setActive(false);
              return;
            }
          } catch {
            // a frame that fails to decode is not an error worth showing
          }
          frame = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setError("Camera permission was refused or no camera is available on this device.");
        setActive(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, onDetect]);

  return (
    <div className="space-y-3">
      {supported ? (
        <Action tone={active ? "danger" : "ghost"} onClick={() => {
          detectedRef.current = false;
          setError(null);
          setActive((v) => !v);
        }}>
          {active ? <CameraOff className="size-3.5" /> : <Camera className="size-3.5" />}
          {active ? "Stop camera" : "Scan with camera"}
        </Action>
      ) : (
        <Kicker>camera scanning unavailable in this browser · use the token field</Kicker>
      )}

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {active ? (
        <div className="overflow-hidden rounded-sm border border-line bg-black">
          <video ref={videoRef} className="h-[240px] w-full object-cover" muted playsInline />
        </div>
      ) : null}
    </div>
  );
}
