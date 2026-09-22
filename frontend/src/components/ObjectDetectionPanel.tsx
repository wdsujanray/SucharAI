import React, { useState, useRef, useEffect } from "react";
import { X, Loader2, Sparkles, HelpCircle, Eye, MessageSquare } from "lucide-react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { api, useChatStore } from "../store.js";
import { storage } from "../lib/firebase.js";

interface DetectedObject {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized between 0 and 1000
  label: string;
  confidence: number;
}

interface ResourceSource {
  title: string;
  url: string;
}

interface ResourceInsight {
  label: string;
  introduction: string;
  sources: ResourceSource[];
}

interface VisualMatchInsight {
  headline: string;
  details: string;
  query: string;
  googleImageUrl: string;
}

interface ObjectDetectionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onInjectPrompt: (prompt: string) => void;
  initialImageFile?: File | null;
  initialImageDataUrl?: string | null;
  autoRun?: boolean;
  onDetectionStateChange?: (state: {
    isDetecting: boolean;
    imageSrc: string | null;
    objects: DetectedObject[];
    error: string | null;
  }) => void;
}

export default function ObjectDetectionPanel({ isOpen, onClose, onInjectPrompt, initialImageFile, initialImageDataUrl, autoRun = false, onDetectionStateChange }: ObjectDetectionPanelProps) {
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const uploadFile = useChatStore((state) => state.uploadFile);
  const createConversation = useChatStore((state) => state.createConversation);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);

  const [imageSrc, setImageSrc] = useState<string | null>(initialImageDataUrl ?? null);
  const [hasInitialSelection, setHasInitialSelection] = useState(Boolean(initialImageFile || initialImageDataUrl));
  const [imageFile, setImageFile] = useState<File | null>(initialImageFile ?? null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [resourceInsights, setResourceInsights] = useState<ResourceInsight[]>([]);
  const [visualMatchInsight, setVisualMatchInsight] = useState<VisualMatchInsight | null>(null);
  const [hoveredObjectIndex, setHoveredObjectIndex] = useState<number | null>(null);
  const [isSearchingGoogleImage, setIsSearchingGoogleImage] = useState(false);
  const [googleLensSourceUrl, setGoogleLensSourceUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoUploadStatus, setAutoUploadStatus] = useState<"uploading" | "uploaded" | "error" | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const buildGoogleSources = (label: string): ResourceSource[] => {
    const query = encodeURIComponent(label.trim());
    return [
      { title: "Google Search", url: `https://www.google.com/search?q=${query}` },
      { title: "Google Images", url: `https://www.google.com/search?tbm=isch&q=${query}` },
    ];
  };

  const buildResourceInsight = (label: string): ResourceInsight => {
    const normalized = label.toLowerCase().trim();

    const catalog: Record<string, { introduction: string; sources: ResourceSource[] }> = {
      person: {
        introduction: "A person is a human being, and in visual analysis this often refers to a face, body, or human figure in the scene.",
        sources: [
          { title: "Britannica: Human", url: "https://www.britannica.com/science/human-being" }
        ]
      },
      car: {
        introduction: "A car is a road vehicle designed for transporting people, usually with four wheels and an engine.",
        sources: [
          { title: "Britannica: Automobile", url: "https://www.britannica.com/technology/automobile" }
        ]
      },
      dog: {
        introduction: "A dog is a domesticated mammal and one of the most common companion animals in the world.",
        sources: [
          { title: "ASPCA: Dog Care", url: "https://www.aspca.org/pet-care/dog-care" }
        ]
      },
      cat: {
        introduction: "A cat is a small domesticated carnivorous mammal known for agility, curiosity, and independent behavior.",
        sources: [
          { title: "ASPCA: Cat Care", url: "https://www.aspca.org/pet-care/cat-care" }
        ]
      },
      laptop: {
        introduction: "A laptop is a portable personal computer designed for everyday work, study, and media use.",
        sources: [
          { title: "TechTarget: Laptop", url: "https://www.techtarget.com/whatis/definition/laptop" }
        ]
      },
      phone: {
        introduction: "A phone is a handheld communication device used for voice calls, messaging, and internet access.",
        sources: [
          { title: "Britannica: Cell phone", url: "https://www.britannica.com/technology/cell-phone" }
        ]
      },
      bottle: {
        introduction: "A bottle is a container commonly used for liquids such as water, drinks, or cleaning products.",
        sources: [
          { title: "Britannica: Bottle", url: "https://www.britannica.com/technology/bottle" }
        ]
      },
      chair: {
        introduction: "A chair is a seat designed to support a person and is common in homes, offices, and public spaces.",
        sources: [
          { title: "Britannica: Chair", url: "https://www.britannica.com/technology/chair" }
        ]
      },
      table: {
        introduction: "A table is a flat horizontal surface commonly used for dining, work, or display.",
        sources: [
          { title: "Britannica: Table", url: "https://www.britannica.com/technology/table" }
        ]
      },
      book: {
        introduction: "A book is a written or printed work made of pages and used for reading, education, or reference.",
        sources: [
          { title: "Britannica: Book", url: "https://www.britannica.com/topic/book" }
        ]
      },
      tree: {
        introduction: "A tree is a perennial plant with a trunk and branches that provides shade, habitat, and oxygen.",
        sources: [
          { title: "National Geographic: Trees", url: "https://education.nationalgeographic.org/resource/trees/" }
        ]
      }
    };

    const matched = Object.entries(catalog).find(([key]) => normalized.includes(key));
    if (matched) {
      return {
        label,
        introduction: `${matched[1].introduction} This object appears to be a recognizable real-world item, and a broader analysis can compare it against online references, related media, and similar visual appearances across the web.`,
        sources: [...buildGoogleSources(label), ...matched[1].sources],
      };
    }

    const query = encodeURIComponent(label);
    return {
      label,
      introduction: `This appears to be ${label}. A comprehensive review can examine whether the object exists in other media formats or elsewhere on the internet, including similar photographs, illustrations, product listings, and reference material.`,
      sources: buildGoogleSources(label)
    };
  };

  const buildVisualMatchInsight = (objects: DetectedObject[]): VisualMatchInsight | null => {
    if (!objects.length) return null;

    const labels = objects.map((obj) => obj.label.toLowerCase());
    const joined = labels.join(" ");
    const hasFaceCue = /(face|human face|facial|eyes|eye|nose|mouth|lips|ear|cheek|forehead|hair|head)/i.test(joined);
    const hasStyleCue = /(style|fashion|outfit|shirt|dress|coat|jacket|hat|glasses|sunglasses|hoodie|pants|skirt|shoes|bag|jewelry|watch|tie|hairstyle)/i.test(joined);

    if (!hasFaceCue && !hasStyleCue) return null;

    const clues = [];
    if (hasFaceCue) clues.push("the face and facial features");
    if (hasStyleCue) clues.push("clothing or style details");

    const query = encodeURIComponent(objects.slice(0, 4).map((obj) => obj.label).join(" "));

    return {
      headline: "Face-based visual match",
      details: `The detection includes ${clues.join(" and ")}, which can point to a recognizable face-based match or related public reference. For accurate human-face detection, focus remains on the face itself rather than body parts or full-body imagery.`,
      query,
      googleImageUrl: `https://lens.google.com/search?ep=ccm&hl=en&re=df&url=${encodeURIComponent("https://www.google.com")}`,
    };
  };

  // Keep this popup upload-only for object detection.
  useEffect(() => {
    if (!isOpen) return;
  }, [isOpen]);

  useEffect(() => {
    onDetectionStateChange?.({
      isDetecting,
      imageSrc: imageSrc ?? initialImageDataUrl ?? null,
      objects: detectedObjects,
      error: errorMsg,
    });
  }, [isDetecting, imageSrc, initialImageDataUrl, detectedObjects, errorMsg, onDetectionStateChange]);

  useEffect(() => {
    if (!isOpen) return;

    const hasSelection = Boolean(initialImageFile || initialImageDataUrl);
    setHasInitialSelection(hasSelection);
    setErrorMsg(null);

    if (!hasSelection) {
      setImageSrc(null);
      setImageFile(null);
      setDetectedObjects([]);
      setResourceInsights([]);
      setVisualMatchInsight(null);
      return;
    }

    if (initialImageDataUrl) {
      setImageSrc(initialImageDataUrl);
    }

    if (initialImageFile) {
      setImageFile(initialImageFile);
      if (!initialImageDataUrl) {
        const reader = new FileReader();
        reader.onload = () => {
          setImageSrc(reader.result as string);
        };
        reader.readAsDataURL(initialImageFile);
      }
    }

    if (autoRun && initialImageFile && !detectedObjects.length && !isDetecting) {
      const timer = window.setTimeout(() => {
        runDetection();
      }, 250);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, initialImageFile, initialImageDataUrl, autoRun]);


  const runDetection = async () => {
    if (!imageFile) {
      console.info("Object detection skipped: no image selected.");
      return;
    }
    setIsBusy(true);
    setIsDetecting(true);
    setErrorMsg(null);
    setDetectedObjects([]);
    setResourceInsights([]);
    setGoogleLensSourceUrl(null);
    setAutoUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append("image", imageFile);

      const response = await api.post("/api/object-detection", formData);

      const objects: DetectedObject[] = response.data?.objects || [];
      setDetectedObjects(objects);
      setResourceInsights(objects.map((obj) => buildResourceInsight(obj.label)));
      setVisualMatchInsight(buildVisualMatchInsight(objects));
      if (objects.length > 0) {
        void prepareGoogleLensSource(false);
      }
      if (objects.length === 0) {
        setErrorMsg("No distinct objects detected in this image. Try another one.");
      }

    } catch (err: any) {
      console.error("Object detection error:", err);
      setErrorMsg(err.response?.data?.detail || "Failed to detect objects. Please try again.");
    } finally {
      setIsDetecting(false);
      setIsBusy(false);
    }
  };

  const clearImage = () => {
    setImageSrc(null);
    setImageFile(null);
    setDetectedObjects([]);
    setResourceInsights([]);
    setVisualMatchInsight(null);
    setGoogleLensSourceUrl(null);
    setErrorMsg(null);
  };

  const handleLocalImageSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please choose an image file such as JPG, PNG, or WEBP.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      setImageSrc(result);
      setImageFile(file);
      setDetectedObjects([]);
      setResourceInsights([]);
      setVisualMatchInsight(null);
      setErrorMsg(null);
      setTimeout(() => runDetection(), 150);
    };
    reader.readAsDataURL(file);

    event.target.value = "";
  };

  const cropDetectedObject = async (object: DetectedObject): Promise<File | null> => {
    if (!imageFile) return null;

    const objectUrl = URL.createObjectURL(imageFile);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("Unable to load the selected image."));
        element.src = objectUrl;
      });

      const [ymin, xmin, ymax, xmax] = object.box_2d;
      const left = Math.floor((Math.max(0, Math.min(1000, xmin)) / 1000) * image.naturalWidth);
      const top = Math.floor((Math.max(0, Math.min(1000, ymin)) / 1000) * image.naturalHeight);
      const right = Math.ceil((Math.max(0, Math.min(1000, xmax)) / 1000) * image.naturalWidth);
      const bottom = Math.ceil((Math.max(0, Math.min(1000, ymax)) / 1000) * image.naturalHeight);
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(image, left, top, width, height, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, imageFile.type || "image/jpeg", 0.92));
      return blob ? new File([blob], `${object.label.replace(/[^a-zA-Z0-9_-]/g, "_")}-lens.jpg`, { type: blob.type }) : null;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const prepareGoogleLensSource = async (openResults: boolean, imageOverride?: File) => {
    const sourceFile = imageOverride ?? imageFile;
    if (!sourceFile) {
      console.info("Google Lens search skipped: no image selected.");
      return;
    }

    setIsSearchingGoogleImage(true);
    setErrorMsg(null);

    try {
      const safeName = sourceFile.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "_") || "google-search-image";
      const storagePath = `google-search/${Date.now()}-${safeName}`;
      const imageRef = ref(storage, storagePath);
      await uploadBytes(imageRef, sourceFile);
      const imageUrl = await getDownloadURL(imageRef);

      if (!imageUrl) {
        throw new Error("No image URL was returned.");
      }

      const searchUrl = `https://lens.google.com/search?ep=ccm&hl=en&re=df&url=${encodeURIComponent(imageUrl)}`;
      setGoogleLensSourceUrl(searchUrl);
      if (openResults) {
        const newTab = window.open(searchUrl, "_blank", "noopener,noreferrer");
        if (!newTab) {
          window.location.assign(searchUrl);
        }
      }
    } catch (err: any) {
      console.error("Google image search failed:", err);
      try {
        const formData = new FormData();
        formData.append("image", sourceFile);
        const response = await api.post("/api/google-image-search", formData);
        const imageUrl = response.data?.imageUrl;

        if (!imageUrl) {
          throw new Error("No image URL was returned.");
        }

        const searchUrl = `https://lens.google.com/search?ep=ccm&hl=en&re=df&url=${encodeURIComponent(imageUrl)}`;
        setGoogleLensSourceUrl(searchUrl);
        if (openResults) {
          const newTab = window.open(searchUrl, "_blank", "noopener,noreferrer");
          if (!newTab) {
            window.location.assign(searchUrl);
          }
        }
      } catch (fallbackErr: any) {
        setErrorMsg(fallbackErr.response?.data?.detail || "Unable to prepare the image for Google reverse-image search.");
      }
    } finally {
      setIsSearchingGoogleImage(false);
    }
  };

  const handleSearchFullImageOnGoogle = async () => {
    await prepareGoogleLensSource(true);
  };

  const handleObjectLensSearch = async (object: DetectedObject) => {
    const croppedFile = await cropDetectedObject(object);
    if (!croppedFile) {
      setErrorMsg("Unable to crop this detected object for Google Lens.");
      return;
    }
    await prepareGoogleLensSource(true, croppedFile);
  };

  const handleAskAI = (label: string) => {
    const insight = buildResourceInsight(label);
    const sourceLine = insight.sources.map((source) => `${source.title}: ${source.url}`).join(" | ");
    onInjectPrompt(`Analyze this detected "${label}" from the image. Give a short introduction and include reputable web resources if available. Sources: ${sourceLine}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in" id="object-detection-modal">
      <div className="bg-panel border border-theme rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-theme flex items-center gap-1.5">
                AI Object Detection & Visual Search
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-mono">Fast</span>
              </h3>
              <p className="text-[11px] text-secondary font-medium">Upload an image to identify objects instantly with bounding boxes and a visual search.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-secondary hover:text-theme hover:bg-surface-soft rounded-lg transition"
            id="close-obj-detection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isBusy && (
          <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-center bg-surface/70 backdrop-blur-sm px-4 py-3 border-b border-theme/80">
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 shadow-sm shadow-emerald-500/10">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Preparing detection and upload…</span>
            </div>
          </div>
        )}

        {/* Error notice */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-950/25 border border-red-900/30 text-red-400 text-xs rounded-xl flex items-center justify-between">
            <span className="font-medium">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-400/70 hover:text-red-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col md:flex-row gap-6 min-h-0">

          {/* Main Visualizer Area */}
          <div className="flex-1 bg-panel rounded-xl border border-theme overflow-hidden flex flex-col items-center justify-center min-h-75 relative group select-none">

            {/* Real-time Scanning effect during detection */}
            {isDetecting && (
              <div className="absolute inset-x-0 h-1 bg-linear-to-r from-transparent via-emerald-400 to-transparent shadow-lg shadow-emerald-500/50 z-20 animate-scan pointer-events-none" />
            )}

            {!imageSrc ? (
              // Empty State/Setup Area
              <div className="w-full h-full flex flex-col p-8">
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-full max-w-md flex flex-col items-center">
                    <div className="mb-4 rounded-2xl border border-theme/60 bg-surface-soft/50 p-4 text-center">
                      <p className="text-xs font-bold text-theme mb-1">Upload a local image for detection</p>
                      <p className="text-[11px] text-secondary">Choose any JPG, PNG, WEBP, or other image stored on your device for object detection and visual search.</p>
                    </div>

                    <div className="flex flex-col items-center gap-3 w-full">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLocalImageSelection}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-6 py-2.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl flex items-center gap-1.5 transition active:scale-95"
                      >
                        <Sparkles className="w-4 h-4" />
                        File Upload
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Image Preview state with SVG bounding box layer
              <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
                <div className="relative max-w-full max-h-[60vh] rounded-xl overflow-hidden shadow-lg border border-theme/60 bg-black flex items-center justify-center">
                  <img
                    src={imageSrc}
                    alt="Source visual"
                    className="max-w-full max-h-[60vh] object-contain block select-none"
                    onLoad={(e) => {
                      // Adjust SVG overlay size if necessary
                    }}
                  />

                  {/* Bounding box SVG layer overlays image exactly */}
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="none"
                  >
                    {detectedObjects.map((obj, idx) => {
                      const [ymin, xmin, ymax, xmax] = obj.box_2d;
                      const isHovered = hoveredObjectIndex === idx;
                      return (
                        <g key={idx}>
                          {/* Outer glow overlay for hovered item */}
                          <rect
                            x={xmin}
                            y={ymin}
                            width={xmax - xmin}
                            height={ymax - ymin}
                            fill={isHovered ? "rgba(16, 185, 129, 0.12)" : "transparent"}
                            stroke={isHovered ? "#10b981" : "#10b981/70"}
                            strokeWidth={isHovered ? "4" : "2"}
                            className="transition-all duration-150"
                          />

                          {/* Label overlay tag */}
                          <foreignObject
                            x={xmin}
                            y={ymin - 26 >= 0 ? ymin - 26 : ymin}
                            width={Math.max(120, xmax - xmin)}
                            height="24"
                          >
                            <div className="flex items-center">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white shadow-md select-none tracking-wide whitespace-nowrap uppercase ${isHovered
                                ? "bg-emerald-500 border border-emerald-400"
                                : "bg-surface border border-theme/60"
                                }`}>
                                {obj.label} ({Math.round(obj.confidence * 100)}%)
                              </span>
                            </div>
                          </foreignObject>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Control bar under preview */}
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={clearImage}
                    className="px-3 py-1.5 bg-surface hover:bg-surface-soft border border-theme rounded-lg text-xs font-bold text-secondary hover:text-theme transition"
                  >
                    Clear Image
                  </button>

                  <button
                    type="button"
                    onClick={runDetection}
                    disabled={isDetecting}
                    className="px-5 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-panel disabled:border-theme text-theme disabled:text-secondary text-xs font-bold rounded-lg transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    {isDetecting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Detecting...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Detect Objects</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar / Detailed Analysis Section */}
          <div className="w-full md:w-80 flex flex-col bg-surface-soft/40 border border-theme rounded-xl p-4 shrink-0 min-h-75">
            {autoUploadStatus === "uploading" && (
              <div className="mb-3 p-3 bg-blue-950/20 border border-blue-900/30 text-blue-400 text-xs rounded-xl flex items-center gap-2 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                <span className="font-semibold">Auto-uploading image for AI analysis...</span>
              </div>
            )}
            {autoUploadStatus === "uploaded" && (
              <div className="mb-3 p-3 bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-450 shrink-0" />
                <span className="font-semibold">Image uploaded to chat for analysis!</span>
              </div>
            )}
            {autoUploadStatus === "error" && (
              <div className="mb-3 p-3 bg-red-950/20 border border-red-900/30 text-red-400 text-xs rounded-xl flex items-center gap-2">
                <X className="w-4 h-4 text-red-450 shrink-0" />
                <span className="font-semibold">Failed to auto-upload to chat.</span>
              </div>
            )}

            <h4 className="text-xs font-bold text-theme border-b border-theme pb-2 mb-3 flex items-center justify-between">
              <span>Detected Objects</span>
              <span className="text-[10px] text-secondary font-mono font-medium">{detectedObjects.length} found</span>
            </h4>

            {detectedObjects.length > 0 && (
              <button
                type="button"
                onClick={handleSearchFullImageOnGoogle}
                disabled={isSearchingGoogleImage}
                className="mb-3 w-full rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[10px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSearchingGoogleImage ? "Preparing image…" : "Search this face on Google Lens"}
              </button>
            )}

            {googleLensSourceUrl && (
              <a
                href={googleLensSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mb-3 block rounded-xl border border-theme/80 bg-surface-soft/70 px-3 py-2 text-center text-[10px] font-semibold text-emerald-400 transition hover:bg-surface"
              >
                Open Google Lens source results
              </a>
            )}

            {isDetecting ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                <span className="text-xs text-secondary font-medium animate-pulse">Running advanced visual analysis...</span>
              </div>
            ) : detectedObjects.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <HelpCircle className="w-8 h-8 text-secondary mb-2" />
                <span className="text-[11px] text-secondary font-medium">
                  {imageSrc ? "Click 'Detect Objects' to identify items" : "Upload an image to see detection breakdown here"}
                </span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1">
                {detectedObjects.map((obj, idx) => (
                  <div
                    key={idx}
                    onMouseEnter={() => setHoveredObjectIndex(idx)}
                    onMouseLeave={() => setHoveredObjectIndex(null)}
                    onClick={() => void handleObjectLensSearch(obj)}
                    className={`p-3 border rounded-xl flex flex-col gap-2 transition cursor-pointer ${hoveredObjectIndex === idx
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-surface-soft/30 border-theme/60 hover:bg-surface-soft/50 hover:border-theme"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-theme uppercase tracking-wide">{obj.label}</span>
                      <span className="text-[10px] bg-surface border border-theme/80 text-emerald-400 font-bold px-1.5 py-0.5 rounded font-mono">
                        {Math.round(obj.confidence * 100)}% Match
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-theme/50">
                      <span className="text-[9px] text-secondary font-medium">Normalized coordinates</span>
                      <span className="text-[9px] text-secondary font-mono">
                        [{obj.box_2d.join(", ")}]
                      </span>
                    </div>

                    <div className="mt-1 rounded-lg border border-theme/70 bg-surface-soft/70 p-2">
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-secondary">Web resource intro</div>
                      <p className="mt-1 text-[10px] leading-relaxed text-secondary">
                        {resourceInsights[idx]?.introduction || `This looks like ${obj.label}. A web resource summary will appear here when it is recognized.`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(resourceInsights[idx]?.sources || []).map((source, sourceIndex) => (
                          <a
                            key={`${source.title}-${sourceIndex}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-full border border-theme/80 bg-surface-soft/80 px-2 py-0.5 text-[9px] text-emerald-400 hover:bg-surface transition"
                          >
                            {source.title}
                          </a>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleAskAI(obj.label);
                      }}
                      className="mt-1 w-full py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Ask SucharAI about this {obj.label}</span>
                    </button>
                  </div>
                ))}

                {visualMatchInsight && (
                  <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">{visualMatchInsight.headline}</div>
                    <p className="mt-1 text-[10px] leading-relaxed text-secondary">{visualMatchInsight.details}</p>
                  </div>
                )}
              </div>
            )}

            {/* Quick Helper card */}
            <div className="mt-4 p-3 bg-surface border border-theme rounded-xl">
              <h5 className="text-[10px] font-bold text-secondary mb-1">⚡ Quick Hack</h5>
              <p className="text-[9px] text-secondary leading-normal">
                Click any object card to immediately trigger a detailed analytical conversation with SucharAI. Hover to highlight the item's precise boundary.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
