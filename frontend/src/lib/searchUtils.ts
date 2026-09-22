const prohibitedSearchTerms = [
    "fuck",
    "shit",
    "bitch",
    "asshole",
    "dick",
    "pussy",
    "cunt",
    "nigger",
    "nigga",
    "fag",
    "slut",
    "whore",
    "damn",
    "bastard",
    "motherfucker",
    "idiot",
    "stupid",
    "retard",
    "moron",
    "trash",
    "kill",
    "hate",
    "abuse",
    "violent",
    "die",
    "bomb"
];

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const profanityRegex = new RegExp(
    `\\b(?:${prohibitedSearchTerms.map(escapeRegExp).join("|")})\\b`,
    "i"
);

export function containsProfanity(text: string): boolean {
    if (!text || typeof text !== "string") return false;
    return profanityRegex.test(text);
}

export function filterProfanity(text: string): string {
    if (!text || typeof text !== "string") return text;
    return text.replace(profanityRegex, "").trim();
}
