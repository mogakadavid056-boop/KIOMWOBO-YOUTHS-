import React, { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, Square, X } from 'lucide-react';
import { formatDurationClock } from '@/src/lib/mediaUtils';
import { supabase } from '@/src/lib/supabase';

// Simple in-memory signed URL cache (45m TTL)
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getChatMediaSignedUrl(pathOrUrl?: string | null): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('blob:')) {
    return pathOrUrl;
  }

  const cached = signedUrlCache.get(pathOrUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from('chat-media')
    .createSignedUrl(pathOrUrl, 3600);

  if (error || !data?.signedUrl) return null;
  signedUrlCache.set(pathOrUrl, {
    url: data.signedUrl,
    expiresAt: Date.now() + 45 * 60_000,
  });
  return data.signedUrl;
}

interface VoiceNotePlayerProps {
  mediaPath?: string | null;
  durationSeconds?: number | null;
  isMine?: boolean;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  mediaPath,
  durationSeconds,
  isMine = false,
}) => {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationSeconds || 0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    getChatMediaSignedUrl(mediaPath).then((url) => {
      if (active) setSrcUrl(url);
    });
    return () => {
      active = false;
    };
  }, [mediaPath]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !srcUrl) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      try {
        audio.playbackRate = speed;
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  };

  const cycleSpeed = () => {
    setSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  const pct =
    totalDuration > 0 ? Math.min(100, Math.round((currentTime / totalDuration) * 100)) : 0;

  return (
    <div className="flex items-center gap-2.5 min-w-[200px] sm:min-w-[230px] py-0.5">
      {srcUrl && (
        <audio
          ref={audioRef}
          src={srcUrl}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const dur = e.currentTarget.duration;
            if (Number.isFinite(dur) && dur > 0) setTotalDuration(dur);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false);
            setCurrentTime(0);
          }}
        />
      )}

      <button
        type="button"
        disabled={!srcUrl}
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition disabled:opacity-45 ${
          isMine
            ? 'bg-[#D4AF37] text-[#080610]'
            : 'bg-[#8B24FF] text-white'
        }`}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div
          className="h-1.5 rounded-full bg-white/20 overflow-hidden cursor-pointer"
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || !totalDuration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.currentTime = ratio * totalDuration;
            setCurrentTime(audio.currentTime);
          }}
        >
          <div
            className="h-full bg-[#F5D88A] transition-[width] duration-100"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] tabular-nums opacity-80">
          <span>{formatDurationClock(playing ? currentTime : totalDuration)}</span>
          <span>🎤 Voice</span>
        </div>
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        className="px-1.5 py-0.5 rounded-md bg-black/25 border border-[#D4AF37]/30 text-[10px] font-royal-ui font-bold text-[#F5D88A] shrink-0"
        title="Playback speed"
      >
        {speed}x
      </button>
    </div>
  );
};

interface VoiceNoteRecorderProps {
  disabled?: boolean;
  onRecorded: (blob: Blob, durationSeconds: number) => Promise<void>;
  onError: (msg: string) => void;
}

export const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({
  disabled = false,
  onRecorded,
  onError,
}) => {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [canceling, setCanceling] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartAtRef = useRef<number>(0);
  const lastTouchTriggerRef = useRef<number>(0);
  const cancelingRef = useRef(false);
  const canceledFlagRef = useRef(false);

  const cleanupMedia = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  };

  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, []);

  const stopRecording = (cancel: boolean) => {
    canceledFlagRef.current = cancel;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      cleanupMedia();
      setRecording(false);
      setElapsed(0);
      setCanceling(false);
      cancelingRef.current = false;
    }
  };

  const startRecording = async () => {
    if (disabled || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Voice recording is not supported on this device/browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      canceledFlagRef.current = false;
      cancelingRef.current = false;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setCanceling(false);
      setRecording(true);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const durSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const shouldCancel = canceledFlagRef.current;
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        cleanupMedia();
        setRecording(false);
        setElapsed(0);
        setCanceling(false);
        cancelingRef.current = false;

        if (!shouldCancel && blob.size > 0) {
          await onRecorded(blob, Math.min(120, durSec));
        }
      };

      recorder.start(250);
      recorderRef.current = recorder;

      timerRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(sec);
        if (sec >= 120) {
          stopRecording(false);
        }
      }, 250);
    } catch {
      cleanupMedia();
      setRecording(false);
      onError('Microphone permission is required to record voice notes.');
    }
  };

  if (recording) {
    return (
      <div
        className="flex items-center gap-2 shrink-0"
        onTouchMove={(e) => {
          if (touchStartXRef.current === null) return;
          const curX = e.touches[0]?.clientX ?? touchStartXRef.current;
          const isCanceling = curX - touchStartXRef.current < -60;
          cancelingRef.current = isCanceling;
          setCanceling(isCanceling);
        }}
        onTouchEnd={() => {
          if (touchStartXRef.current === null) return;
          const heldMs = Date.now() - touchStartAtRef.current;
          const shouldCancel = cancelingRef.current;
          touchStartXRef.current = null;
          // Quick tap (< 450ms) stays locked in recording mode until user taps Send or X
          if (shouldCancel) {
            stopRecording(true);
          } else if (heldMs >= 450) {
            stopRecording(false);
          }
        }}
      >
        <div
          className={`min-h-[44px] px-3 rounded-xl flex items-center gap-2 text-xs font-royal-ui font-bold ${
            canceling
              ? 'bg-red-600/80 text-white'
              : 'bg-[#31005F] border border-[#D4AF37]/60 text-[#F5D88A]'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className="tabular-nums">{formatDurationClock(elapsed)}</span>
          <span className="hidden sm:inline opacity-80">
            {canceling ? 'Release to cancel' : '← Slide / Cancel'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => stopRecording(true)}
          className="min-w-[40px] min-h-[44px] rounded-xl border border-red-400/50 text-red-400 flex items-center justify-center"
          aria-label="Cancel voice note"
        >
          <X className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => stopRecording(false)}
          className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center justify-center gap-1"
          aria-label="Send voice note"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>Send</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onTouchStart={(e) => {
        touchStartXRef.current = e.touches[0]?.clientX ?? null;
        touchStartAtRef.current = Date.now();
        lastTouchTriggerRef.current = Date.now();
        cancelingRef.current = false;
        startRecording();
      }}
      onClick={() => {
        if (Date.now() - lastTouchTriggerRef.current < 600) return;
        if (!recording) startRecording();
      }}
      className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-45 shrink-0 shadow-md"
      aria-label="Record voice note"
      title="Hold or tap to record voice note (max 2m)"
    >
      <Mic className="w-4 h-4" />
    </button>
  );
};
