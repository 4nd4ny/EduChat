import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdMic, MdStop, MdVolumeOff, MdVolumeUp } from "react-icons/md";
import { useAnthropic } from "../context/AnthropicProvider";
import { authHeaders } from "../utils/account";
import { useT } from "../i18n/useT";

// Chat vocal — pensé pour smartphone, réservé à la clé PERSONNELLE et aux
// fournisseurs dotés d'une API de transcription (OpenAI, Mistral).
//
//  - Micro : enregistre (MediaRecorder), transcrit via /api/transcribe (clé
//    de l'utilisateur), puis ENVOIE directement si le mode vocal est actif,
//    sinon dépose le texte dans la zone de saisie (dictée).
//  - Haut-parleur : mode vocal — les réponses du tuteur sont lues à voix
//    haute par la synthèse du NAVIGATEUR (gratuit, rien ne quitte l'appareil).
//
// Le parent ne rend ce composant que si (clé perso + fournisseur compatible).

const SPEECH_LANG: Record<string, string> = { fr: "fr-FR", en: "en-US", it: "it-IT", de: "de-DE" };

/** Débarrasse la réponse de son balisage pour une lecture naturelle. */
function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_#>|]/g, "")
    .replace(/\$+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function VoiceControls({ onDictation }: { onDictation: (text: string) => void }) {
  const { provider, apiKey, addMessage, messages, loading } = useAnthropic();
  // apiKey peut être vide : le serveur prendra la clé mémorisée du compte.
  const t = useT();
  const router = useRouter();

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastSpokenRef = useRef<string>("");

  // Préférence mémorisée (localStorage) — utile sur mobile au fil des sessions.
  useEffect(() => {
    setVoiceMode(localStorage.getItem("educhat-voice-mode") === "1");
  }, []);
  const toggleVoiceMode = useCallback(() => {
    setVoiceMode(previous => {
      const next = !previous;
      localStorage.setItem("educhat-voice-mode", next ? "1" : "0");
      if (!next && typeof window !== "undefined") window.speechSynthesis?.cancel();
      return next;
    });
  }, []);

  // Lecture vocale : dès qu'une réponse est COMPLÈTE (fin du flux), la lire.
  //
  // Sur Mistral, Voxtral donne une voix nettement plus naturelle — mais chaque
  // lecture est un appel facturé. En cas d'échec (pas de clé, refus, réseau),
  // on retombe SILENCIEUSEMENT sur la synthèse du navigateur : mieux vaut une
  // voix ordinaire que pas de voix du tout.
  useEffect(() => {
    if (!voiceMode || loading || typeof window === "undefined") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.id === lastSpokenRef.current) return;
    if (last.content.startsWith("Erreur")) return;
    lastSpokenRef.current = last.id;
    const texte = speakableText(last.content);

    const parLeNavigateur = () => {
      if (!window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(texte);
      utterance.lang = SPEECH_LANG[router.locale ?? "fr"] ?? "fr-FR";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };

    if (provider !== "mistral") { parLeNavigateur(); return; }

    let vivant = true;
    window.speechSynthesis?.cancel();
    fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ text: texte, locale: router.locale ?? "fr", ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }),
    })
      .then(response => (response.ok ? response.blob() : Promise.reject()))
      .then(blob => {
        if (!vivant) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        return audio.play();
      })
      .catch(() => { if (vivant) parLeNavigateur(); });
    return () => { vivant = false; };
  }, [messages, loading, voiceMode, provider, apiKey, router.locale]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
  }, []);

  const transcribe = useCallback(async (blob: Blob, mimeType: string) => {
    setTranscribing(true); setError("");
    try {
      const audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const response = await fetch("/api/transcribe", {
        method: "POST",
        // Le jeton permet au serveur d'utiliser la clé mémorisée du compte
        // quand le champ « clé personnelle » est vide.
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ provider, apiKey, mimeType, audio }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.text !== "string") throw new Error("transcription");
      const text = data.text.trim();
      if (!text) return;
      // Mode vocal : la question part directement — conversation mains libres.
      if (voiceMode) addMessage(text);
      else onDictation(text);
    } catch {
      setError(t("chat.input.voice.error"));
    } finally {
      setTranscribing(false);
    }
  }, [provider, apiKey, voiceMode, addMessage, onDictation, t]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Chrome/Firefox : webm/opus ; Safari (iPhone/iPad) : mp4/AAC.
      const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0) void transcribe(blob, mimeType);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError(t("chat.input.voice.denied"));
    }
  }, [transcribe, t]);

  return (
    <>
      <button type="button" data-tour="voice"
        onClick={() => (recording ? stopRecording() : void startRecording())}
        disabled={transcribing}
        title={recording ? t("chat.input.voice.stop") : t("chat.input.voice.start")}
        aria-label={recording ? t("chat.input.voice.stop") : t("chat.input.voice.start")}
        className={`rounded p-4 ${recording ? "animate-pulse bg-red-600 text-white" : "text-primary hover:bg-[#DC6521]"}`}>
        {transcribing
          ? <div className="mx-auto h-5 w-5 animate-spin rounded-full border-b-2 border-white" />
          : recording ? <MdStop /> : <MdMic />}
      </button>
      <button type="button"
        onClick={toggleVoiceMode}
        title={voiceMode ? t("chat.input.voice.mode.on") : t("chat.input.voice.mode.off")}
        aria-label={voiceMode ? t("chat.input.voice.mode.on") : t("chat.input.voice.mode.off")}
        aria-pressed={voiceMode}
        className={`rounded p-4 ${voiceMode ? "text-[#DC6521]" : "text-primary opacity-60"} hover:bg-[#DC6521] hover:text-white hover:opacity-100`}>
        {voiceMode ? <MdVolumeUp /> : <MdVolumeOff />}
      </button>
      {error && <span role="alert" className="absolute -top-6 right-2 text-xs text-red-400">{error}</span>}
    </>
  );
}
