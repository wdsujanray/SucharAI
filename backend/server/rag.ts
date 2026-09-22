import { readDb, writeDb } from "./db.js";

export function splitTextIntoChunks(text: string, chunkSize: number = 800, overlap: number = 150): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentIndex = 0;

  while (currentIndex < words.length) {
    const chunkWords = words.slice(currentIndex, currentIndex + chunkSize);
    chunks.push(chunkWords.join(" "));
    currentIndex += chunkSize - overlap;
  }

  return chunks;
}

export function searchDocumentChunks(query: string, conversationId: number, limit: number = 3): string {
  const db = readDb();
  const docs = db.documents.filter((d) => d.conversationId === conversationId);
  
  if (docs.length === 0) {
    return "";
  }

  // Tokenize query words
  const queryWords = query.toLowerCase().split(/\W+/).filter(Boolean);
  if (queryWords.length === 0) {
    return "";
  }

  interface ScoredChunk {
    text: string;
    score: number;
    filename: string;
  }

  const allScoredChunks: ScoredChunk[] = [];

  for (const doc of docs) {
    // Split the document into chunks
    const chunks = splitTextIntoChunks(doc.text);
    
    for (const chunk of chunks) {
      const chunkLower = chunk.toLowerCase();
      let score = 0;
      
      for (const word of queryWords) {
        // Count frequencies for keyword scoring
        const regex = new RegExp(`\\b${word}\\b`, "g");
        const matches = chunkLower.match(regex);
        if (matches) {
          score += matches.length;
        }
      }

      if (score > 0) {
        allScoredChunks.push({
          text: chunk,
          score,
          filename: doc.filename
        });
      }
    }
  }

  // Sort by highest score first
  allScoredChunks.sort((a, b) => b.score - a.score);

  const bestChunks = allScoredChunks.slice(0, limit);
  if (bestChunks.length === 0) {
    return "";
  }

  return bestChunks
    .map((chunk) => `[Source document: ${chunk.filename} (Relevance Score: ${chunk.score})]\n${chunk.text}`)
    .join("\n\n---\n\n");
}
