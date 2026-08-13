"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { LuArrowLeft, LuArrowRight, LuBadgeCheck, LuCamera, LuCameraOff, LuCircleCheck, LuEye, LuEyeOff, LuImagePlus, LuLockKeyhole, LuScanFace, LuShieldCheck, LuUpload, LuX } from "react-icons/lu";
import { Brand } from "@/components/ui/brand";
import { isStrongPassword, KNUST_STUDENT_EMAIL_PATTERN, normalizeEmail, normalizeStudentId, PERSONAL_EMAIL_PATTERN, STUDENT_ID_PATTERN } from "@/lib/auth-validation";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password";

type AuthScreenProps = {
  mode: AuthMode;
};

type RecoveryState = "idle" | "checking" | "ready" | "invalid";
type SignupStep = 1 | 2;
type StudentRecordState = "idle" | "checking" | "verified";
type CameraState = "idle" | "requesting" | "ready" | "scanning" | "verified" | "error";
type SignupAvailability = "checking" | "open" | "locked" | "unavailable";

const currentYear = new Date().getFullYear();
const studentIdTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const copy = {
  "sign-in": {
    title: "Welcome back",
    subtitle: "Use your personal email, student email, or student ID.",
    button: "Sign in",
  },
  "sign-up": {
    title: "Create your student account",
    subtitle: "Add your academic details, then complete the ID and camera-access check.",
    button: "Create account",
  },
  "forgot-password": {
    title: "Reset your password",
    subtitle: "Enter either email or your student ID to receive a secure reset link.",
    button: "Send reset link",
  },
  "reset-password": {
    title: "Choose a new password",
    subtitle: "Create a secure password for your library account.",
    button: "Update password",
  },
} satisfies Record<AuthMode, { title: string; subtitle: string; button: string }>;

export function AuthScreen({ mode }: AuthScreenProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [indexNumber, setIndexNumber] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [programme, setProgramme] = useState("");
  const [startYear, setStartYear] = useState(String(currentYear));
  const [completionYear, setCompletionYear] = useState(String(currentYear + 4));
  const [gender, setGender] = useState("");
  const [residence, setResidence] = useState("");
  const [location, setLocation] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recoveryState, setRecoveryState] = useState<RecoveryState>(mode === "reset-password" ? "checking" : "idle");
  const [signupStep, setSignupStep] = useState<SignupStep>(1);
  const [studentRecordState, setStudentRecordState] = useState<StudentRecordState>("idle");
  const [studentIdFile, setStudentIdFile] = useState<File | null>(null);
  const [studentIdPreviewUrl, setStudentIdPreviewUrl] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState("");
  const [faceSnapshotFile, setFaceSnapshotFile] = useState<File | null>(null);
  const [identityConsentAt, setIdentityConsentAt] = useState("");
  const [signupCreated, setSignupCreated] = useState(false);
  const [signupAvailability, setSignupAvailability] = useState<SignupAvailability>(mode === "sign-up" ? "checking" : "open");
  const [signupLockNoticeOpen, setSignupLockNoticeOpen] = useState(false);
  const studentIdPreviewRef = useRef<string | null>(null);
  const studentIdInputRef = useRef<HTMLInputElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const cameraAttemptRef = useRef(0);
  const signupInteractedRef = useRef(false);
  const signupLockNoticeShownRef = useRef(false);
  const signupAvailabilityRefreshRef = useRef<(() => void) | null>(null);
  const signupLockDialogRef = useRef<HTMLElement | null>(null);
  const signupLockSignInRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (mode === "sign-in" && new URLSearchParams(window.location.search).get("confirmed") === "1") {
      const confirmationMessage = window.setTimeout(() => {
        setSuccess("Your personal email is confirmed. You can now sign in with either email or your student ID.");
        window.history.replaceState({}, "", window.location.pathname);
      }, 0);
      return () => window.clearTimeout(confirmationMessage);
    }

    if (mode !== "reset-password") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const demoReady = window.setTimeout(() => setRecoveryState("ready"), 0);
      return () => window.clearTimeout(demoReady);
    }

    let active = true;
    let recoveryEventSeen = false;
    const currentUrl = new URL(window.location.href);
    const hash = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
    const hasRecoveryHint = currentUrl.searchParams.get("recovery") === "1"
      || currentUrl.searchParams.has("code")
      || currentUrl.searchParams.get("type") === "recovery"
      || hash.get("type") === "recovery";

    const validateRecoveryUser = async (finalAttempt: boolean) => {
      const { data, error: userError } = await supabase.auth.getUser();
      if (!active) return;
      if (!userError && data.user && (hasRecoveryHint || recoveryEventSeen)) {
        setRecoveryState("ready");
      } else if (finalAttempt) {
        setRecoveryState("invalid");
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user) {
        recoveryEventSeen = true;
        window.setTimeout(() => void validateRecoveryUser(false), 0);
      }
    });
    const firstCheck = window.setTimeout(() => void validateRecoveryUser(false), 500);
    const finalCheck = window.setTimeout(() => void validateRecoveryUser(true), 2500);

    return () => {
      active = false;
      window.clearTimeout(firstCheck);
      window.clearTimeout(finalCheck);
      listener.subscription.unsubscribe();
    };
  }, [mode]);

  useEffect(() => () => {
    cameraAttemptRef.current += 1;
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (studentIdPreviewRef.current) URL.revokeObjectURL(studentIdPreviewRef.current);
  }, []);

  useEffect(() => {
    if (mode !== "sign-up") return;

    const controller = new AbortController();
    let active = true;

    const loadSignupAvailability = async () => {
      try {
        const response = await fetch("/api/auth/sign-up-status", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => null) as { signupLocked?: unknown; signupsLocked?: unknown } | null;
        const locked = result?.signupLocked ?? result?.signupsLocked;
        if (!active) return;
        const availability: SignupAvailability = response.ok && typeof locked === "boolean" ? (locked ? "locked" : "open") : "unavailable";
        setSignupAvailability(availability);
        if (availability === "open") {
          signupLockNoticeShownRef.current = false;
          setSignupLockNoticeOpen(false);
          return;
        }
        if (signupInteractedRef.current && !signupLockNoticeShownRef.current) {
          signupLockNoticeShownRef.current = true;
          setSignupLockNoticeOpen(true);
        }
      } catch (caughtError) {
        if (!active || (caughtError instanceof DOMException && caughtError.name === "AbortError")) return;
        setSignupAvailability("unavailable");
        if (signupInteractedRef.current && !signupLockNoticeShownRef.current) {
          signupLockNoticeShownRef.current = true;
          setSignupLockNoticeOpen(true);
        }
      }
    };

    const refreshSignupAvailability = () => void loadSignupAvailability();
    signupAvailabilityRefreshRef.current = refreshSignupAvailability;
    refreshSignupAvailability();
    return () => {
      active = false;
      controller.abort();
      if (signupAvailabilityRefreshRef.current === refreshSignupAvailability) signupAvailabilityRefreshRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (!signupLockNoticeOpen) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => signupLockSignInRef.current?.focus(), 50);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSignupLockNoticeOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        signupLockDialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [signupLockNoticeOpen]);

  const stopCamera = () => {
    cameraAttemptRef.current += 1;
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const setStudentIdDocument = (file: File | null) => {
    if (studentIdPreviewRef.current) {
      URL.revokeObjectURL(studentIdPreviewRef.current);
      studentIdPreviewRef.current = null;
    }
    setStudentIdPreviewUrl(null);
    setStudentIdFile(null);

    if (!file) return;
    if (!studentIdTypes.has(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Use a clear JPG, PNG, or WEBP image no larger than 5 MB.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    studentIdPreviewRef.current = previewUrl;
    setStudentIdPreviewUrl(previewUrl);
    setStudentIdFile(file);
    setError("");
  };

  const validateSignupDetails = () => {
    const normalizedStudentEmail = normalizeEmail(studentEmail);
    const normalizedPersonalEmail = normalizeEmail(personalEmail);
    const normalizedIndex = normalizeStudentId(indexNumber);
    const parsedStartYear = Number(startYear);
    const parsedCompletionYear = Number(completionYear);

    if (fullName.trim().length < 2) return "Enter your full name exactly as it appears on your student record.";
    if (!STUDENT_ID_PATTERN.test(normalizedIndex)) return "Enter a valid eight-digit KNUST index number, such as 21135353.";
    if (!PERSONAL_EMAIL_PATTERN.test(normalizedPersonalEmail) || KNUST_STUDENT_EMAIL_PATTERN.test(normalizedPersonalEmail)) return "Enter a valid personal email that is separate from your KNUST student email.";
    if (!KNUST_STUDENT_EMAIL_PATTERN.test(normalizedStudentEmail)) return "Your student email must end in @st.knust.edu.gh.";
    if (normalizedStudentEmail === normalizedPersonalEmail) return "Your personal and student email addresses must be different.";
    if (department.trim().length < 2) return "Enter your department.";
    if (programme.trim().length < 2) return "Enter your programme of study.";
    if (!Number.isInteger(parsedStartYear) || parsedStartYear < 2000 || parsedStartYear > currentYear + 1) return "Enter a valid programme start year.";
    if (!Number.isInteger(parsedCompletionYear) || parsedCompletionYear < parsedStartYear || parsedCompletionYear > parsedStartYear + 12) return "Enter a completion year that follows your start year.";
    if (!gender) return "Select your gender or choose Prefer not to say.";
    if (!residence) return "Select whether you live on or off campus.";
    if (location.trim().length < 2) return "Enter your hall, hostel, or residential area.";
    if (password !== confirmPassword) return "Your passwords do not match.";
    if (!isStrongPassword(password)) return "Use at least 8 characters with at least one letter and one number.";
    return null;
  };

  const requestCamera = async () => {
    stopCamera();
    setFaceSnapshotFile(null);
    setCameraError("");
    setCameraState("requesting");
    const attempt = ++cameraAttemptRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setCameraError("This browser cannot open the camera. Try a current browser on a device with a camera.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 540 } },
        audio: false,
      });
      if (attempt !== cameraAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraState("ready");
    } catch {
      if (attempt !== cameraAttemptRef.current) return;
      stopCamera();
      setCameraState("error");
      setCameraError("Camera access was not granted. Allow camera permission in your browser, then try again.");
    }
  };

  const captureFaceSnapshot = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 1 || video.videoHeight < 1) return null;
    const scale = Math.min(1, 720 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size === 0 || blob.size > 1024 * 1024) return null;
    return new File([blob], "face-presence.jpg", { type: "image/jpeg", lastModified: Date.now() });
  };

  const runCameraScan = () => {
    if (!cameraStreamRef.current?.getVideoTracks().some((track) => track.readyState === "live")) {
      setCameraState("error");
      setCameraError("The camera stream ended. Open the camera again to complete the check.");
      return;
    }
    setCameraError("");
    setCameraState("scanning");
    scanTimerRef.current = window.setTimeout(async () => {
      scanTimerRef.current = null;
      const snapshot = await captureFaceSnapshot();
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (!snapshot) {
        setFaceSnapshotFile(null);
        setCameraState("error");
        setCameraError("A clear face-presence image could not be captured. Open the camera and try again.");
        return;
      }
      setFaceSnapshotFile(snapshot);
      setCameraState("verified");
    }, 2200);
  };

  const returnToSignupDetails = () => {
    stopCamera();
    setCameraState("idle");
    setFaceSnapshotFile(null);
    setCameraError("");
    setStudentRecordState("idle");
    setIdentityConsentAt("");
    setSignupStep(1);
    setError("");
    setSuccess("");
  };

  const openSignupLockNotice = () => {
    signupLockNoticeShownRef.current = true;
    setSignupLockNoticeOpen(true);
  };

  const handleSignupInteraction = () => {
    if (mode !== "sign-up") return;
    const isFirstInteraction = !signupInteractedRef.current;
    signupInteractedRef.current = true;
    if (isFirstInteraction) signupAvailabilityRefreshRef.current?.();
    if ((signupAvailability === "locked" || signupAvailability === "unavailable") && !signupLockNoticeShownRef.current) {
      openSignupLockNotice();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (mode === "sign-up") {
      signupInteractedRef.current = true;
      if (signupAvailability !== "open") {
        if (signupAvailability === "locked" || signupAvailability === "unavailable") openSignupLockNotice();
        setError(signupAvailability === "checking"
          ? "Sign-up availability is still being checked. Please wait a moment."
          : "Student sign-ups are not accepting new accounts right now.");
        return;
      }

      const detailsError = validateSignupDetails();
      if (detailsError) {
        setError(detailsError);
        return;
      }

      if (signupStep === 1) {
        setStudentRecordState("checking");
        const precheckController = new AbortController();
        const precheckTimeout = window.setTimeout(() => precheckController.abort(), 12_000);
        try {
          const response = await fetch("/api/auth/sign-up-precheck", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            credentials: "same-origin",
            body: JSON.stringify({
              studentEmail: normalizeEmail(studentEmail),
              indexNumber: normalizeStudentId(indexNumber),
            }),
            signal: precheckController.signal,
          });
          const result = await response.json().catch(() => null) as { eligible?: boolean; error?: string; code?: string } | null;
          if (!response.ok || result?.eligible !== true) {
            throw new Error(result?.error || "Your student registration could not be verified. Check your student email and ID.");
          }
          setStudentRecordState("verified");
          setSignupStep(2);
        } catch (precheckError) {
          setStudentRecordState("idle");
          if (precheckController.signal.aborted) {
            setError("The student registration check took too long. Check your connection and try again.");
          } else {
            setError(precheckError instanceof Error ? precheckError.message : "Your student registration could not be verified.");
          }
        } finally {
          window.clearTimeout(precheckTimeout);
        }
        return;
      }

      if (studentRecordState !== "verified") return void setError("Return to student details and complete the record check.");
      if (!studentIdFile) return void setError("Upload the front of your KNUST student ID to continue.");
      if (cameraState !== "verified") return void setError("Complete the short camera-access check to continue.");
      if (!faceSnapshotFile) return void setError("Capture a clear face-presence image to continue.");
    }

    if (mode === "reset-password" && password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    if (mode === "reset-password" && !isStrongPassword(password)) {
      setError("Use at least 8 characters with at least one letter and one number.");
      return;
    }

    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    try {
      if (!supabase) {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        if (mode === "forgot-password" || mode === "reset-password") {
          setSuccess("Demo mode: your reset link is ready once Supabase is connected.");
          return;
        }
        if (mode === "sign-up") {
          window.localStorage.setItem("knust-demo-profile", JSON.stringify({
            fullName: fullName.trim(),
            indexNumber: normalizeStudentId(indexNumber),
            email: normalizeEmail(personalEmail),
            studentEmail: normalizeEmail(studentEmail),
            department: department.trim(),
            programme: programme.trim(),
            yearStarted: Number(startYear),
            yearCompletion: Number(completionYear),
            gender,
            residenceType: residence,
            residenceLocation: location.trim(),
            identityVerificationMode: "simulation",
            studentRecordCheckStatus: "simulated_passed",
            facialScanStatus: "simulated_completed_no_biometric_match",
            studentIdStatus: "demo_not_stored",
            identityConsent: true,
            identityConsentAt,
          }));
          router.push("/library");
          return;
        }
        router.push(identifier.toLowerCase().includes("admin") ? "/admin" : "/library");
        return;
      }

      if (mode === "sign-in") {
        const response = await fetch("/api/auth/sign-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, password }),
        });
        const result = await response.json() as { accessToken?: string; refreshToken?: string; destination?: string; error?: string };
        if (!response.ok || !result.accessToken || !result.refreshToken) throw new Error(result.error || "Sign-in could not be completed.");
        const { error: sessionError } = await supabase.auth.setSession({ access_token: result.accessToken, refresh_token: result.refreshToken });
        if (sessionError) throw new Error("Your secure session could not be started. Please try again.");
        const allowedDestination = result.destination === "/admin" || result.destination === "/librarian" || result.destination === "/library"
          ? result.destination
          : "/library";
        router.replace(allowedDestination);
        router.refresh();
        return;
      }

      if (mode === "sign-up") {
        const formData = new FormData();
        formData.set("fullName", fullName.trim());
        formData.set("indexNumber", normalizeStudentId(indexNumber));
        formData.set("personalEmail", normalizeEmail(personalEmail));
        formData.set("studentEmail", normalizeEmail(studentEmail));
        formData.set("password", password);
        formData.set("department", department.trim());
        formData.set("programme", programme.trim());
        formData.set("startYear", startYear);
        formData.set("completionYear", completionYear);
        formData.set("gender", gender);
        formData.set("residence", residence);
        formData.set("location", location.trim());
        formData.set("studentRecordCheck", "simulated-passed");
        formData.set("facialScanCheck", "simulated-completed");
        formData.set("identityConsent", "true");
        formData.set("identityConsentAt", identityConsentAt);
        formData.set("studentIdFront", studentIdFile!);
        formData.set("facePresenceSnapshot", faceSnapshotFile!);

        const signupController = new AbortController();
        const signupTimeout = window.setTimeout(() => signupController.abort(), 60_000);
        let response: Response;
        try {
          response = await fetch("/api/auth/sign-up", {
            method: "POST",
            body: formData,
            signal: signupController.signal,
          });
        } catch (requestError) {
          if (signupController.signal.aborted) {
            throw new Error("Account creation is taking longer than expected. Check your personal email before retrying so you do not create a duplicate request.");
          }
          throw requestError;
        } finally {
          window.clearTimeout(signupTimeout);
        }
        const result = await response.json().catch(() => null) as { message?: string; error?: string; code?: string } | null;
        if (response.status === 423 || result?.code === "SIGNUPS_LOCKED") {
          setSignupAvailability("locked");
          setError("");
          openSignupLockNotice();
          return;
        }
        if (!response.ok) throw new Error(result?.error || "Your account could not be created.");
        setSignupCreated(true);
        setSuccess(result?.message || "Account created. Check your personal inbox to confirm it, then sign in.");
        return;
      }

      if (mode === "reset-password") {
        if (recoveryState !== "ready") throw new Error("This password reset link is invalid or has expired.");
        const { data: recoveryUser, error: recoveryError } = await supabase.auth.getUser();
        if (recoveryError || !recoveryUser.user) {
          setRecoveryState("invalid");
          throw new Error("This password reset link is invalid or has expired.");
        }
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setSuccess("Password updated. You can now sign in with your new password.");
        await supabase.auth.signOut();
        window.setTimeout(() => router.replace("/sign-in"), 900);
        return;
      }

      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const result = await response.json() as { message?: string };
      setSuccess(result.message || "If those details match an account, a reset link has been sent to the personal email inbox.");
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Something went wrong. Please try again.";
      setError(/already registered|duplicate|unique/i.test(message) ? "An account already uses that student email, personal email, or student ID." : message);
    } finally {
      setLoading(false);
    }
  };

  const identityReady = studentRecordState === "verified" && Boolean(studentIdFile) && cameraState === "verified" && Boolean(faceSnapshotFile) && Boolean(identityConsentAt);
  const signupBusy = studentRecordState === "checking" || loading || (mode === "sign-up" && signupAvailability === "checking");
  const submitDisabled = loading
    || signupCreated
    || (mode === "sign-up" && (signupAvailability !== "open" || studentRecordState === "checking" || (signupStep === 2 && !identityReady)));
  const submitLabel = loading
    ? (mode === "sign-up" ? "Creating your account…" : "Securing your account…")
    : mode === "sign-up" && signupAvailability === "checking"
      ? "Checking sign-up availability…"
      : mode === "sign-up" && signupAvailability === "locked"
        ? "Sign-ups temporarily suspended"
        : mode === "sign-up" && signupAvailability === "unavailable"
          ? "Sign-ups temporarily unavailable"
    : mode === "sign-up" && signupStep === 1
      ? (studentRecordState === "checking" ? "Checking student details…" : "Continue to ID verification")
      : copy[mode].button;

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Brand href="/" compact className="auth-brand" />

        <div className={`auth-form-wrap${mode === "sign-up" ? " auth-form-wrap--signup" : ""}`}>
          {mode === "forgot-password" && (
            <Link href="/sign-in" className="auth-back-link">← Back to sign in</Link>
          )}
          <div className="auth-heading">
            <span className="auth-heading__kicker">{mode === "sign-up" ? "STUDENT REGISTRATION" : "ACCOUNT ACCESS"}</span>
            <h1>{copy[mode].title}</h1>
            <p>{copy[mode].subtitle}</p>
          </div>

          {mode === "reset-password" && recoveryState !== "ready" ? (
            <div className="auth-recovery-state" role="status" aria-live="polite">
              {recoveryState === "checking" ? (
                <>
                  <i className="button-spinner button-spinner--navy" aria-hidden="true" />
                  <strong>Validating your secure reset link…</strong>
                  <p>This should only take a moment.</p>
                </>
              ) : (
                <>
                  <LuShieldCheck aria-hidden="true" />
                  <strong>This reset link is invalid or has expired.</strong>
                  <p>Request a new link using any email or your student ID.</p>
                  <Link href="/forgot-password" className="button button--primary">Request a new link</Link>
                </>
              )}
            </div>
          ) : <form className="auth-form" onSubmit={handleSubmit} onFocusCapture={handleSignupInteraction} onChangeCapture={handleSignupInteraction}>
            {mode === "sign-up" && (
              <ol className="signup-progress" aria-label="Account creation progress">
                <li className={signupStep === 1 ? "is-active" : "is-complete"} aria-current={signupStep === 1 ? "step" : undefined}>
                  <span>{signupStep === 2 ? <LuCircleCheck aria-hidden="true" /> : "1"}</span>
                  <div><strong>Student details</strong><small>Academic profile</small></div>
                </li>
                <li className={signupStep === 2 ? "is-active" : ""} aria-current={signupStep === 2 ? "step" : undefined}>
                  <span>2</span>
                  <div><strong>ID &amp; Facial recognition</strong><small>Private identity check</small></div>
                </li>
              </ol>
            )}

            {mode === "sign-up" && signupAvailability !== "open" && (
              <div
                className={`signup-lock-status signup-lock-status--${signupAvailability}`}
                id="signup-lock-status-message"
                role="status"
                aria-live="polite"
              >
                <LuLockKeyhole aria-hidden="true" />
                <p>
                  <strong>{signupAvailability === "checking" ? "Checking student registration" : signupAvailability === "locked" ? "New sign-ups are suspended" : "New sign-ups are unavailable"}</strong>
                  <span>{signupAvailability === "checking" ? "Account creation will unlock only after availability is confirmed." : "Existing students can continue to sign in normally."}</span>
                </p>
                {signupAvailability !== "checking" && <button type="button" onClick={openSignupLockNotice}>View notice</button>}
              </div>
            )}

            {mode === "sign-up" && signupStep === 1 && (
              <div className="signup-details-grid">
                <label className="field field--line field--wide">
                  <span>Full name</span>
                  <input name="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="e.g. Ama Serwaa Mensah" required />
                </label>
                <label className="field field--line field--wide">
                  <span>Index number / Student ID</span>
                  <input name="indexNumber" value={indexNumber} onChange={(event) => setIndexNumber(event.target.value.toUpperCase())} autoComplete="off" placeholder="e.g. 21135353" disabled={studentRecordState === "checking"} required />
                  <small className="field-hint">Matched securely with your registered KNUST student email.</small>
                </label>
                <label className="field field--line field--wide">
                  <span>Personal email</span>
                  <input name="personalEmail" value={personalEmail} onChange={(event) => setPersonalEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@gmail.com" required />
                  <small className="field-hint">Used for sign-in, security notices, and the confirmation link.</small>
                </label>
                <label className="field field--line field--wide">
                  <span>KNUST student email</span>
                  <input name="studentEmail" value={studentEmail} onChange={(event) => setStudentEmail(event.target.value)} type="email" autoComplete="username" placeholder="you@st.knust.edu.gh" disabled={studentRecordState === "checking"} required />
                  <small className="field-hint">Must match an active KNUST signup record before identity verification begins.</small>
                </label>
                <label className="field field--line">
                  <span>Department</span>
                  <input name="department" value={department} onChange={(event) => setDepartment(event.target.value)} autoComplete="organization" placeholder="e.g. Computer Science" required />
                </label>
                <label className="field field--line">
                  <span>Programme</span>
                  <input name="programme" value={programme} onChange={(event) => setProgramme(event.target.value)} placeholder="e.g. BSc Computer Science" required />
                </label>
                <label className="field field--line">
                  <span>Start year</span>
                  <input name="startYear" value={startYear} onChange={(event) => setStartYear(event.target.value)} type="number" inputMode="numeric" min="2000" max={currentYear + 1} required />
                </label>
                <label className="field field--line">
                  <span>Completion year</span>
                  <input name="completionYear" value={completionYear} onChange={(event) => setCompletionYear(event.target.value)} type="number" inputMode="numeric" min={startYear || "2000"} max={currentYear + 15} required />
                </label>
                <label className="field field--line">
                  <span>Gender</span>
                  <select name="gender" value={gender} onChange={(event) => setGender(event.target.value)} required>
                    <option value="">Select an option</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non-binary">Non-binary</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </label>
                <label className="field field--line">
                  <span>Residence</span>
                  <select name="residence" value={residence} onChange={(event) => setResidence(event.target.value)} required>
                    <option value="">Select an option</option>
                    <option value="on-campus">On campus</option>
                    <option value="off-campus">Off campus</option>
                  </select>
                </label>
                <label className="field field--line field--wide">
                  <span>{residence === "on-campus" ? "Hall or campus residence" : residence === "off-campus" ? "Hostel or residential area" : "Residence location"}</span>
                  <input name="location" value={location} onChange={(event) => setLocation(event.target.value)} autoComplete="street-address" placeholder="e.g. Unity Hall or Ayeduase" required />
                </label>
                <label className="field field--line">
                  <span>Password</span>
                  <span className="password-input">
                    <input name="password" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <LuEyeOff /> : <LuEye />}
                    </button>
                  </span>
                </label>
                <label className="field field--line">
                  <span>Confirm password</span>
                  <input name="confirmPassword" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Repeat your password" minLength={8} required />
                </label>
              </div>
            )}

            {mode === "sign-up" && signupStep === 2 && (
              <section className="identity-step" aria-labelledby="identity-step-title">
                <div className="student-record-check" role="status">
                  <LuBadgeCheck aria-hidden="true" />
                  <div>
                    <strong>KNUST student registration matched</strong>
                    <p>Your student email and student ID matched an active, unused signup record.</p>
                  </div>
                </div>

                <div className="identity-step__heading">
                  <span>STEP 2 OF 2</span>
                  <h2 id="identity-step-title">ID &amp; Facial recognition</h2>
                  <p>Add the front of your student ID, then complete a short live camera interaction.</p>
                </div>

                <div className="identity-grid">
                  <section className="identity-card" aria-labelledby="student-id-title">
                    <div className="identity-card__heading">
                      <LuImagePlus aria-hidden="true" />
                      <div><strong id="student-id-title">Student ID front</strong><small>JPG, PNG, or WEBP · Max 5 MB</small></div>
                    </div>

                    {studentIdPreviewUrl && studentIdFile ? (
                      <div className="student-id-preview">
                        <Image src={studentIdPreviewUrl} alt="Preview of the selected student ID front" width={220} height={112} unoptimized />
                        <div>
                          <strong>{studentIdFile.name}</strong>
                          <span>{formatFileSize(studentIdFile.size)}</span>
                        </div>
                        <button type="button" onClick={() => setStudentIdDocument(null)} aria-label="Remove selected student ID image"><LuX aria-hidden="true" /></button>
                      </div>
                    ) : (
                      <button className="student-id-upload" type="button" onClick={() => studentIdInputRef.current?.click()}>
                        <LuUpload aria-hidden="true" />
                        <strong>Upload a clear ID image</strong>
                        <span>Keep all four corners visible and avoid glare.</span>
                      </button>
                    )}
                    <input
                      ref={studentIdInputRef}
                      className="visually-hidden"
                      id="student-id-front"
                      name="studentIdFront"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      onChange={(event) => {
                        setStudentIdDocument(event.target.files?.[0] ?? null);
                        event.target.value = "";
                      }}
                    />
                    {studentIdFile && <button className="identity-replace-link" type="button" onClick={() => studentIdInputRef.current?.click()}><LuUpload aria-hidden="true" /> Replace image</button>}
                  </section>

                  <section className="identity-card identity-camera" aria-labelledby="camera-check-title">
                    <div className="identity-card__heading">
                      <LuScanFace aria-hidden="true" />
                      <div><strong id="camera-check-title">Live camera check</strong><small>About 2 seconds</small></div>
                    </div>

                    <div className={`identity-camera__stage identity-camera__stage--${cameraState}`} aria-live="polite">
                      <video ref={videoRef} autoPlay muted playsInline aria-label="Live front camera preview" />
                      {(cameraState === "idle" || cameraState === "error") && (
                        <div className="identity-camera__placeholder"><LuCamera aria-hidden="true" /><span>Camera is off</span></div>
                      )}
                      {cameraState === "requesting" && (
                        <div className="identity-camera__placeholder"><i className="button-spinner" aria-hidden="true" /><span>Waiting for permission…</span></div>
                      )}
                      {cameraState === "scanning" && <div className="identity-camera__scan"><span>Live-presence simulation</span></div>}
                      {cameraState === "verified" && (
                        <div className="identity-camera__placeholder identity-camera__placeholder--success"><LuCircleCheck aria-hidden="true" /><strong>Face-presence image secured</strong><span>Camera access has ended.</span></div>
                      )}
                    </div>

                    {cameraError && <p className="identity-camera__error" role="alert"><LuCameraOff aria-hidden="true" /> {cameraError}</p>}
                    <div className="identity-camera__actions">
                      {(cameraState === "idle" || cameraState === "error") && <button type="button" className="button button--outline" onClick={() => void requestCamera()}><LuCamera aria-hidden="true" /> Open camera</button>}
                      {cameraState === "ready" && <button type="button" className="button button--primary" onClick={runCameraScan}><LuScanFace aria-hidden="true" /> Start short scan</button>}
                      {cameraState === "verified" && <button type="button" className="button button--outline" onClick={() => void requestCamera()}><LuCamera aria-hidden="true" /> Run again</button>}
                    </div>
                  </section>
                </div>

                <div className="identity-disclaimer">
                  <LuShieldCheck aria-hidden="true" />
                  <p><strong>Private identity evidence.</strong> The check stores one encrypted-at-rest face-presence image in private storage for administrator review. It does not perform biometric matching or create a biometric template.</p>
                </div>
                <label className="identity-consent">
                  <input
                    type="checkbox"
                    checked={Boolean(identityConsentAt)}
                    onChange={(event) => setIdentityConsentAt(event.target.checked ? new Date().toISOString() : "")}
                    required
                  />
                  <span>
                    <strong>I consent to secure identity processing</strong>
                    <small>My student ID and one face-presence image will be stored privately for administrator-only identity review. My details may be used for circulation and account recovery. No biometric matching or template is created.</small>
                  </span>
                </label>
                <div className={`identity-readiness${identityReady ? " is-ready" : ""}`} role="status">
                  {identityReady ? <LuCircleCheck aria-hidden="true" /> : <LuShieldCheck aria-hidden="true" />}
                  <span>{identityReady ? "Identity steps complete — account creation is unlocked." : "Upload your ID front, finish the camera check, and provide consent to unlock account creation."}</span>
                </div>
              </section>
            )}

            {mode !== "reset-password" && mode !== "sign-up" && (
              <label className="field field--line">
                <span>{mode === "sign-in" ? "Email or student ID" : "Account email or student ID"}</span>
                <input name="identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} type="text" autoComplete={mode === "sign-in" ? "username" : "off"} placeholder="Personal email, student email, or student ID" required />
              </label>
            )}

            {mode !== "forgot-password" && mode !== "sign-up" && (
              <label className="field field--line">
                <span>Password</span>
                <span className="password-input">
                  <input name="password" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} placeholder="Enter your password" minLength={8} required />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <LuEyeOff /> : <LuEye />}
                  </button>
                </span>
              </label>
            )}

            {mode === "reset-password" && (
              <label className="field field--line">
                <span>Confirm password</span>
                <input name="confirmPassword" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Repeat your password" minLength={8} required />
              </label>
            )}

            {mode === "sign-in" && <div className="auth-options auth-options--end"><Link href="/forgot-password">Forgot password?</Link></div>}

            {error && <p className="form-message form-message--error" role="alert">{error}</p>}
            {success && <p className="form-message form-message--success" role="status">{success}</p>}

            {mode === "sign-up" && signupStep === 2 && !signupCreated && (
              <button className="signup-back-button" type="button" onClick={returnToSignupDetails} disabled={loading}>
                <LuArrowLeft aria-hidden="true" /> Edit student details
              </button>
            )}

            {!signupCreated && (
              <button className="button button--primary auth-submit" type="submit" disabled={submitDisabled} aria-describedby={mode === "sign-up" && signupAvailability !== "open" ? "signup-lock-status-message" : undefined}>
                <span>{signupBusy && <i className="button-spinner" aria-hidden="true" />}{submitLabel}</span>
                {!signupBusy && <LuArrowRight aria-hidden="true" />}
              </button>
            )}
          </form>}

          {mode === "sign-in" && (
            <p className="auth-switch">New to the library? <Link href="/sign-up">Create an account</Link></p>
          )}
          {mode === "sign-up" && (
            <p className="auth-switch">Already have an account? <Link href="/sign-in">Sign in</Link></p>
          )}
          {mode === "reset-password" && (
            <p className="auth-switch">Remembered your password? <Link href="/sign-in">Back to sign in</Link></p>
          )}

          {!isSupabaseConfigured && mode === "sign-in" && (
            <div className="demo-note">
              <LuShieldCheck aria-hidden="true" />
              <p><strong>Preview mode</strong><span>Use any valid email and 8-character password. Include “admin” in the email to open the admin dashboard.</span></p>
            </div>
          )}
        </div>

        <p className="auth-footer">© 2026 Kwame Nkrumah University of Science and Technology</p>
      </section>

      <aside className="auth-visual" aria-label="KNUST library">
        <Image src="/library.png" alt="A bright KNUST library reading space" width={1600} height={1200} sizes="(max-width: 900px) 100vw, 50vw" className="auth-visual__image" priority />
        <div className="auth-visual__overlay" />
        <div className="auth-visual__copy auth-visual__copy--simple"><h2>KNUST Library Mall</h2></div>
      </aside>

      {mode === "sign-up" && signupLockNoticeOpen && (
        <div className="signup-lock-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSignupLockNoticeOpen(false)}>
          <section
            ref={signupLockDialogRef}
            className="signup-lock-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-lock-modal-title"
            aria-describedby="signup-lock-modal-description"
          >
            <button className="signup-lock-modal__close" type="button" onClick={() => setSignupLockNoticeOpen(false)} aria-label="Close sign-up notice">
              <LuX aria-hidden="true" />
            </button>
            <span className="signup-lock-modal__icon" aria-hidden="true"><LuLockKeyhole /></span>
            <span className="signup-lock-modal__eyebrow">STUDENT REGISTRATION</span>
            <h2 id="signup-lock-modal-title">{signupAvailability === "locked" ? "Student sign-ups are temporarily suspended" : "Student sign-ups are temporarily unavailable"}</h2>
            <p id="signup-lock-modal-description">
              {signupAvailability === "locked"
                ? "New account registration is unavailable for now. Please come back later or wait until further notice."
                : "We could not safely confirm that registration is open, so new account creation is paused for now. Please try again later."}
            </p>
            <p className="signup-lock-modal__existing">Existing students can still sign in freely with their personal email, student email, or student ID.</p>
            <div className="signup-lock-modal__actions">
              <Link ref={signupLockSignInRef} href="/sign-in" className="button button--primary">Go to sign in <LuArrowRight aria-hidden="true" /></Link>
              <button className="button button--outline" type="button" onClick={() => setSignupLockNoticeOpen(false)}>Close</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
