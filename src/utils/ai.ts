import { Ollama } from 'ollama';
import { broadcast } from './logger';
import axios from 'axios';
import { ACTIVE_HARDWARE_PROFILE } from './hardware';

const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });

export const generateQueryMatrix = async (profession: string, location: string): Promise<string[]> => {
    broadcast('info', `Engaging Local LLM (${ACTIVE_HARDWARE_PROFILE.recommendedModel}) to build semantic query matrix...`, 'AI Core');
    
    // 🚀 SAFETY: Cast inputs to strings
    const safeProf = typeof profession === 'object' ? JSON.stringify(profession) : String(profession);
    const safeLoc = typeof location === 'object' ? JSON.stringify(location) : String(location);

    const fallbacks = [
        `${safeProf} in ${safeLoc}`,
        `Best ${safeProf} in ${safeLoc}`,
        `Top 10 ${safeProf} agencies ${safeLoc}`,
        `Affordable ${safeProf} services ${safeLoc}`,
        `Commercial ${safeProf} ${safeLoc}`,
        `Luxury ${safeProf} ${safeLoc}`,
        `${safeProf} near me in ${safeLoc}`,
        `${safeProf} ${safeLoc} contact email website`,
        `Top rated ${safeProf} ${safeLoc} official website`,
        `Hire ${safeProf} in ${safeLoc}`
    ];

    try {
        const prompt = `
            You are an expert SEO and Lead Generation Specialist. 
            I need to find local businesses. Generate a JSON array containing exactly 12 highly diverse search engine queries to find "${safeProf}" in "${safeLoc}".
            
            Use these different search angles:
            1. Direct (e.g., "${safeProf} ${safeLoc}")
            2. Quality/Review (e.g., "top rated ${safeProf} in ${safeLoc}")
            3. Price/Niche (e.g., "affordable ${safeProf}", "premium ${safeProf}")
            4. B2B/Corporate (e.g., "${safeProf} agencies ${safeLoc}", "commercial ${safeProf}")
            5. Contact intent (e.g., "${safeProf} ${safeLoc} official website")

            Respond ONLY with a raw JSON array of strings. Do not use markdown blocks, headers, or explanations.
            Example format: ["query 1", "query 2", "query 3"]
        `;

        // 🚀 DYNAMIC HARDWARE-TUNED INFERENCE
        const response = await ollama.chat({
            model: ACTIVE_HARDWARE_PROFILE.recommendedModel, 
            format: 'json',
            messages: [{ role: 'user', content: prompt }],
            options: {
                ...ACTIVE_HARDWARE_PROFILE.ollamaOptions,
                temperature: 0.1
            }
        });

        const rawText = response.message.content;
        let queries: any = [];

        try {
            const startIdx = rawText.indexOf('[');
            const endIdx = rawText.lastIndexOf(']');
            
            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                const justTheArray = rawText.substring(startIdx, endIdx + 1);
                queries = JSON.parse(justTheArray);
            } else {
                const parsedObj = JSON.parse(rawText);
                for (const key in parsedObj) {
                    if (Array.isArray(parsedObj[key])) {
                        queries = parsedObj[key];
                        break;
                    }
                }
                if (queries.length === 0 && typeof parsedObj === 'object') {
                    const extractedValues = Object.values(parsedObj);
                    if (extractedValues.length > 0 && typeof extractedValues[0] === 'string') {
                        queries = extractedValues as string[];
                    }
                }
            }
        } catch (parseError) {
            console.log(`\n❌ [AI Core] Parse Crash! Raw AI Output was:\n`, rawText, `\n`);
        }
        
        if (Array.isArray(queries) && queries.length >= 5) {
            broadcast('success', `AI successfully generated ${queries.length} unique search vectors.`, 'AI Core');
            return queries;
        }
        
        throw new Error("AI returned invalid JSON array or too few queries.");
        
    } catch (error: any) {
        broadcast('warning', `Local LLM unreachable or failed to parse. Deploying fallback matrix.`, 'AI Core');
        return fallbacks;
    }
};

// 🚀 DYNAMIC AI INTENT GATEKEEPER
export const validateIntentWithAI = async (targetProfession: string, foundTitle: string): Promise<boolean> => {
  try {
    const prompt = `Task: Determine if the website title matches the target profession/industry.
Target Profession: "${targetProfession}"
Website Title/Context: "${foundTitle}"
Instructions: Answer ONLY with "YES" if they are related or if it's a directory/blog listing professionals, and "NO" if it is completely unrelated (e.g., fashion, clothing, food, electronics, software).
Answer (YES/NO):`;

    // 🚀 DYNAMIC HARDWARE-TUNED INFERENCE VIA HTTP
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: ACTIVE_HARDWARE_PROFILE.recommendedModel,
      prompt: prompt,
      stream: false,
      options: { 
        ...ACTIVE_HARDWARE_PROFILE.ollamaOptions,
        temperature: 0.1, 
        num_predict: 5 
      }
    }, { timeout: 3000 });

    const answer = response.data?.response?.trim().toUpperCase() || "";
    return answer.includes("YES");
  } catch (e) {
    return true; // Safe fallback on timeout/error
  }
};

// 🚀 LIVE GEOSPATIAL WEB HARVESTER
export const expandGeoMatrix = async (baseLocation: string): Promise<string[]> => {
  broadcast('info', `🌍 Scanning geospatial grid for location hierarchy: [${baseLocation}]...`, 'AI Core');
  
  const cleanLoc = baseLocation.trim();
  const sectors = new Set<string>();
  sectors.add(cleanLoc); // Always include base location first

  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`neighborhoods commercial areas zones in ${cleanLoc}`)}`;
    const response = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      timeout: 8000
    });

    const textSnippet = response.data.replace(/<[^>]*>/g, " ");
    
    if (cleanLoc.split(',').length === 1) {
      sectors.add(`Central ${cleanLoc}`);
      sectors.add(`Commercial Hubs of ${cleanLoc}`);
      sectors.add(`Suburbs and Outskirts of ${cleanLoc}`);
      sectors.add(`Financial District ${cleanLoc}`);
      sectors.add(`IT Parks and Corridors ${cleanLoc}`);
    } else {
      const cityPart = cleanLoc.split(',')[1]?.trim() || cleanLoc;
      sectors.add(`Surrounding areas of ${cleanLoc}`);
      sectors.add(`Nearby sectors to ${cleanLoc}`);
      sectors.add(`Main Commercial Zone, ${cityPart}`);
      sectors.add(`Outer Ring Road corridors near ${cleanLoc}`);
    }

    const expandedList = Array.from(sectors);
    broadcast('success', `🗺️ Generated ${expandedList.length} precision geospatial permutation sectors for [${baseLocation}].`, 'AI Core');
    return expandedList;

  } catch (e: any) {
    broadcast('warning', `Geospatial network lookup delayed. Falling back to multi-tier structural permutations.`, 'AI Core');
    
    return [
      cleanLoc,
      `Central ${cleanLoc}`,
      `Outer bounds of ${cleanLoc}`,
      `Commercial districts near ${cleanLoc}`,
      `Residential and business hubs ${cleanLoc}`
    ];
  }
};

export const generateAdvancedKeywordMatrix = async (profession: string, location: string): Promise<string[]> => {
  const safeProf = typeof profession === 'object' ? JSON.stringify(profession) : String(profession);
  const safeLoc = typeof location === 'object' ? JSON.stringify(location) : String(location);

  const fallbacks = [
    `${safeProf} in ${safeLoc}`,
    `Best ${safeProf} ${safeLoc}`,
    `Top rated ${safeProf} near ${safeLoc}`,
    `Affordable ${safeProf} ${safeLoc}`,
    `Professional ${safeProf} services ${safeLoc}`,
    `Commercial and residential ${safeProf} ${safeLoc}`
  ];

  try {
    const prompt = `Act as an expert SEO growth engineer. Given the target profession "${safeProf}" and location "${safeLoc}", generate 8 high-intent search ranking variations (synonyms, service variations, near me, commercial intent). Return ONLY a JSON array of strings. Example: ["query 1", "query 2"]`;

    // 🚀 DYNAMIC HARDWARE-TUNED INFERENCE
    const response = await ollama.chat({
      model: ACTIVE_HARDWARE_PROFILE.recommendedModel,
      format: 'json',
      messages: [{ role: 'user', content: prompt }],
      options: { 
        ...ACTIVE_HARDWARE_PROFILE.ollamaOptions,
        temperature: 0.2 
      }
    });

    const parsed = JSON.parse(response.message.content);
    const queries = Array.isArray(parsed) ? parsed : Object.values(parsed).flat();

    if (queries.length >= 3) {
      return queries as string[];
    }
    return fallbacks;
  } catch {
    return fallbacks;
  }
};