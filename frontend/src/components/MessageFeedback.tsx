import React, { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, ShieldCheck, Loader2, Star } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, firestore } from "../lib/firebase.js";
import { useChatStore } from "../store.js";

interface MessageFeedbackProps {
  messageId: string | number;
  conversationId: string | number;
}

type FeedbackRating = "helpful" | "unhelpful" | "1-star" | "2-star" | "3-star" | "4-star" | "5-star";

interface PersistedFeedbackState {
  quickReaction: "helpful" | "unhelpful" | null;
  rating: FeedbackRating | null;
  feedbackText: string;
  permissionGranted: boolean;
  showForm: boolean;
}

const defaultFeedbackState: PersistedFeedbackState = {
  quickReaction: null,
  rating: null,
  feedbackText: "",
  permissionGranted: true,
  showForm: false,
};

export default function MessageFeedback({ messageId, conversationId }: MessageFeedbackProps) {
  const { submitFeedback, user } = useChatStore();
  const userId = user?.id?.toString() || auth.currentUser?.uid || "anonymous";

  const [feedbackState, setFeedbackState] = useState<PersistedFeedbackState>(defaultFeedbackState);

  const updateFeedbackState = (updates: Partial<PersistedFeedbackState>) => {
    setFeedbackState((prev) => {
      const nextState = { ...prev, ...updates };
      if (userId && userId !== "anonymous") {
        const preferenceRef = doc(firestore, "messageFeedbackPrefs", `${userId}:${conversationId}:${messageId}`);
        void setDoc(preferenceRef, nextState, { merge: true });
      }
      return nextState;
    });
  };

  useEffect(() => {
    let cancelled = false;

    const loadPersistedFeedback = async () => {
      if (!userId || userId === "anonymous") return;

      try {
        const preferenceRef = doc(firestore, "messageFeedbackPrefs", `${userId}:${conversationId}:${messageId}`);
        const snapshot = await getDoc(preferenceRef);
        if (!cancelled && snapshot.exists()) {
          const data = snapshot.data() as Partial<PersistedFeedbackState>;
          setFeedbackState({ ...defaultFeedbackState, ...data });
        }
      } catch (err) {
        console.warn("Could not load feedback preference from Firestore:", err);
      }
    };

    void loadPersistedFeedback();
    return () => {
      cancelled = true;
    };
  }, [conversationId, messageId, userId]);

  const { quickReaction, rating, feedbackText, permissionGranted, showForm } = feedbackState;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleRate = async (selectedRating: FeedbackRating | null) => {
    if (selectedRating === "helpful" || selectedRating === "unhelpful") {
      if (quickReaction === selectedRating) {
        updateFeedbackState({ quickReaction: null, showForm: false });
        return;
      }

      updateFeedbackState({ quickReaction: selectedRating, showForm: false });
      setIsSubmitting(true);
      try {
        await submitFeedback(messageId, conversationId, selectedRating, feedbackText, permissionGranted);
        setIsSubmitted(true);
      } catch (err) {
        console.error("Feedback submit error:", err);
        alert("Failed to submit feedback. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (rating === selectedRating) {
      updateFeedbackState({ rating: null, showForm: false });
      return;
    }

    updateFeedbackState({ rating: selectedRating, showForm: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;

    setIsSubmitting(true);
    try {
      await submitFeedback(
        messageId,
        conversationId,
        rating,
        feedbackText,
        permissionGranted
      );
      setIsSubmitted(true);
      updateFeedbackState({ showForm: false });
    } catch (err) {
      console.error("Feedback submit error:", err);
      alert("Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 mt-1 w-full items-start">
      {/* Quick Rating Buttons */}
      <div className="flex flex-wrap items-center gap-1.5 shrink-0 leading-none">
        <button
          onClick={() => handleRate("helpful")}
          className={`rounded border p-1 transition cursor-pointer ${quickReaction === "helpful" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-secondary border-theme bg-surface hover:text-theme"
            }`}
          title="Helpful"
        >
          <ThumbsUp className="w-3 h-3" />
        </button>
        <button
          onClick={() => handleRate("unhelpful")}
          className={`rounded border p-1 transition cursor-pointer ${quickReaction === "unhelpful" ? "text-rose-400 border-rose-500/30 bg-rose-500/10" : "text-secondary border-theme bg-surface hover:text-theme"
            }`}
          title="Unhelpful"
        >
          <ThumbsDown className="w-3 h-3" />
        </button>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-secondary">|</span>
        <button
          type="button"
          onClick={() => {
            updateFeedbackState({ showForm: false, rating: null });
          }}
          className="text-[9px] font-semibold uppercase tracking-wider text-secondary hover:text-theme transition"
        >
          Rate this response
        </button>
        <div className="flex items-center gap-1">
          {([1, 2, 3, 4, 5] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => handleRate(`${value}-star` as const)}
              className={`p-1 rounded-full transition ${rating === `${value}-star` ? "bg-emerald-500/10 text-emerald-400" : "text-secondary hover:text-theme hover:bg-surface"}`}
              title={`${value} star${value > 1 ? "s" : ""}`}
            >
              <Star className="w-3 h-3" />
            </button>
          ))}
        </div>
      </div>


      {/* Expanded Feedback Form with Consent Checkbox */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="w-full bg-panel/80 border border-theme/80 p-3 rounded-lg space-y-2.5 max-w-sm mt-1 animate-slide-in self-start"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-secondary">
            <MessageSquare className="w-3 h-3 text-emerald-400" />
            <span>Tell us why (optional)</span>
          </div>

          <textarea
            value={feedbackText}
            onChange={(e) => updateFeedbackState({ feedbackText: e.target.value })}
            placeholder={rating === "helpful" ? "What was good about this response?" : "What went wrong or how can we improve?"}
            rows={2}
            className="w-full px-2 py-1.5 bg-input border border-theme rounded text-xs text-theme placeholder-text-secondary focus:outline-none focus:border-emerald-500/50 resize-none"
          />

          {/* Step 2 Permission / Consent Control */}
          <div className="flex items-start gap-2 bg-surface-soft/40 p-2 rounded border border-theme/50">
            <input
              type="checkbox"
              id={`consent-${messageId}`}
              checked={permissionGranted}
              onChange={(e) => updateFeedbackState({ permissionGranted: e.target.checked })}
              className="mt-0.5 rounded border-theme text-emerald-500 focus:ring-emerald-500/40 focus:ring-offset-0 bg-input accent-emerald-500"
            />
            <label
              htmlFor={`consent-${messageId}`}
              className="text-[9px] text-secondary leading-normal select-none cursor-pointer flex items-center gap-1"
            >
              <ShieldCheck className="w-3 h-3 text-emerald-400 inline shrink-0" />
              <span>Allow sending my feedback and query context to help improve model responses</span>
            </label>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => updateFeedbackState({ showForm: false })}
              className="px-2 py-1 bg-surface hover:bg-surface-soft text-secondary hover:text-theme text-[10px] font-semibold rounded transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !permissionGranted}
              className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-panel disabled:text-secondary text-black text-[10px] font-bold rounded transition cursor-pointer flex items-center gap-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <span>Submit Feedback</span>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
