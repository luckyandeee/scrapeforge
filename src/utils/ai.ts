// import { broadcast } from './logger';
// import axios from 'axios';

// export const generateQueryMatrix = async (profession: string, location: string, lowPowerMode: boolean = false): Promise<string[]> => {
//     const safeProf = String(profession || '').trim();
//     const safeLoc = String(location || '').trim();
    
//     // 🚀 IRONCLAD DEDUPLICATION: Ensure location is never repeated if already present
//     let seed = safeProf;
//     if (safeLoc && !safeProf.toLowerCase().includes(safeLoc.toLowerCase())) {
//         seed = `${safeProf} in ${safeLoc}`;
//     }

//     const fallbacks = [
//         seed,
//         `Best ${seed}`,
//         `Top 10 ${safeProf} in ${safeLoc}`,
//         `Affordable ${safeProf} services in ${safeLoc}`,
//         `Commercial ${safeProf} ${safeLoc}`,
//         `Luxury ${safeProf} ${safeLoc}`
//     ];

//     if (lowPowerMode) {
//         broadcast('info', `[Eco Mode] Using clean static permutation matrix for [${seed}].`, 'AI Core');
//         return fallbacks;
//     }

//     broadcast('info', `Fetching live Google search suggestions for [${seed}]...`, 'AI Core');

//     try {
//         const url = `https://www.google.com/complete/search?client=chrome&q=${encodeURIComponent(seed)}`;
//         const response = await axios.get(url, {
//             headers: {
//                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
//             },
//             timeout: 5000
//         });

//         const suggestions = response.data?.[1];

//         if (Array.isArray(suggestions) && suggestions.length > 0) {
//             broadcast('success', `Google provided ${suggestions.length} live high-intent search vectors.`, 'AI Core');
//             return Array.from(new Set([seed, ...suggestions]));
//         }

//         throw new Error("Empty autocomplete array returned.");
//     } catch (error: any) {
//         broadcast('warning', `Live Google keyword fetch skipped. Deploying high-intent structural fallback.`, 'AI Core');
//         return fallbacks;
//     }
// };

// // 🚀 DETERMINISTIC INTENT GATEKEEPER (Zero AI Overhead)
// export const validateIntentWithAI = async (targetProfession: string, foundTitle: string): Promise<boolean> => {
//   try {
//     const profTokens = targetProfession.toLowerCase().split(' ');
//     const titleLower = foundTitle.toLowerCase();
    
//     // Returns true if any significant keyword matches the title, or if it looks like a directory/profile
//     return profTokens.some(token => token.length > 2 && titleLower.includes(token)) || 
//            titleLower.includes('directory') || 
//            titleLower.includes('listing') || 
//            titleLower.includes('hub');
//   } catch (e) {
//     return true; // Safe fallback
//   }
// };

// // 🚀 LIVE GEOSPATIAL WEB HARVESTER
// export const expandGeoMatrix = async (baseLocation: string, lowPowerMode: boolean = false): Promise<string[]> => {
//   const cleanLoc = baseLocation.trim();
//   const sectors = new Set<string>();
//   sectors.add(cleanLoc); // Always include base location first

//   if (lowPowerMode) {
//     broadcast('info', `[Eco Mode] Using structured geospatial permutations for [${cleanLoc}] (Network lookup skipped).`, 'AI Core');
//     if (cleanLoc.split(',').length === 1) {
//       sectors.add(`Central ${cleanLoc}`);
//       sectors.add(`Commercial Hubs of ${cleanLoc}`);
//       sectors.add(`Suburbs and Outskirts of ${cleanLoc}`);
//     } else {
//       const cityPart = cleanLoc.split(',')[1]?.trim() || cleanLoc;
//       sectors.add(`Surrounding areas of ${cleanLoc}`);
//       sectors.add(`Main Commercial Zone, ${cityPart}`);
//     }
//     return Array.from(sectors);
//   }

//   broadcast('info', `🌍 Scanning geospatial grid for location hierarchy: [${cleanLoc}]...`, 'AI Core');

//   try {
//     const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`neighborhoods commercial areas zones in ${cleanLoc}`)}`;
//     const response = await axios.get(searchUrl, {
//       headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
//       timeout: 8000
//     });
    
//     if (cleanLoc.split(',').length === 1) {
//       sectors.add(`Central ${cleanLoc}`);
//       sectors.add(`Commercial Hubs of ${cleanLoc}`);
//       sectors.add(`Suburbs and Outskirts of ${cleanLoc}`);
//       sectors.add(`Financial District ${cleanLoc}`);
//       sectors.add(`IT Parks and Corridors ${cleanLoc}`);
//     } else {
//       const cityPart = cleanLoc.split(',')[1]?.trim() || cleanLoc;
//       sectors.add(`Surrounding areas of ${cleanLoc}`);
//       sectors.add(`Nearby sectors to ${cleanLoc}`);
//       sectors.add(`Main Commercial Zone, ${cityPart}`);
//       sectors.add(`Outer Ring Road corridors near ${cleanLoc}`);
//     }

//     const expandedList = Array.from(sectors);
//     broadcast('success', `🗺️ Generated ${expandedList.length} precision geospatial permutation sectors for [${baseLocation}].`, 'AI Core');
//     return expandedList;

//   } catch (e: any) {
//     broadcast('warning', `Geospatial network lookup delayed. Falling back to multi-tier structural permutations.`, 'AI Core');
    
//     return [
//       cleanLoc,
//       `Central ${cleanLoc}`,
//       `Outer bounds of ${cleanLoc}`,
//       `Commercial districts near ${cleanLoc}`,
//       `Residential and business hubs ${cleanLoc}`
//     ];
//   }
// };

// export const generateAdvancedKeywordMatrix = async (profession: string, location: string, lowPowerMode: boolean = false): Promise<string[]> => {
//   return generateQueryMatrix(profession, location, lowPowerMode);
// };

import { broadcast } from './logger';
import axios from 'axios';

// 🚀 KEYWORD MATRIX — this is the single owner of query permutation in the discovery pipeline.
// discoverBusinesses() (in discovery.ts) calls this once per sector to get the full set of decorated
// query variants: the seed, structural templates ("Best X", "Top 10 X", etc), and — when not in Eco
// Mode — real live Google autocomplete suggestions for that seed. Each variant is then handed as-is
// to querySearchCluster(), which must NOT re-run this decoration. It previously did, which produced
// doubled phrasing like "Best Best hotels in Hyderabad" and a duplicate live-suggestions network call
// every cycle — see discovery.ts for the consuming side of this contract.
export const generateQueryMatrix = async (profession: string, location: string, lowPowerMode: boolean = false): Promise<string[]> => {
    const safeProf = String(profession || '').trim();
    const safeLoc = String(location || '').trim();

    // 🚀 IRONCLAD DEDUPLICATION: Ensure location is never repeated if already present
    let seed = safeProf;
    if (safeLoc && !safeProf.toLowerCase().includes(safeLoc.toLowerCase())) {
        seed = `${safeProf} in ${safeLoc}`;
    }
    const fallbacks = [
        seed,
        `Best ${seed}`,
        `Top 10 ${safeProf} in ${safeLoc}`,
        `Affordable ${safeProf} services in ${safeLoc}`,
        `Commercial ${safeProf} ${safeLoc}`,
        `Luxury ${safeProf} ${safeLoc}`
    ];
    if (lowPowerMode) {
        broadcast('info', `[Eco Mode] Using clean static permutation matrix for [${seed}].`, 'AI Core');
        return fallbacks;
    }
    broadcast('info', `Fetching live Google search suggestions for [${seed}]...`, 'AI Core');
    try {
        // 🚀 THIS is the real "intelligent keyword" source: live Google autocomplete for the seed
        // query, which surfaces actual high-intent phrasing people search for, not just templates.
        const url = `https://www.google.com/complete/search?client=chrome&q=${encodeURIComponent(seed)}`;
        const response = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            timeout: 5000
        });
        const suggestions = response.data?.[1];
        if (Array.isArray(suggestions) && suggestions.length > 0) {
            broadcast('success', `Google provided ${suggestions.length} live high-intent search vectors.`, 'AI Core');
            return Array.from(new Set([seed, ...suggestions]));
        }
        throw new Error("Empty autocomplete array returned.");
    } catch (error: any) {
        broadcast('warning', `Live Google keyword fetch skipped. Deploying high-intent structural fallback.`, 'AI Core');
        return fallbacks;
    }
};

// 🚀 DETERMINISTIC INTENT GATEKEEPER (Zero AI Overhead)
export const validateIntentWithAI = async (targetProfession: string, foundTitle: string): Promise<boolean> => {
  try {
    const profTokens = targetProfession.toLowerCase().split(' ');
    const titleLower = foundTitle.toLowerCase();

    // Returns true if any significant keyword matches the title, or if it looks like a directory/profile
    return profTokens.some(token => token.length > 2 && titleLower.includes(token)) ||
           titleLower.includes('directory') ||
           titleLower.includes('listing') ||
           titleLower.includes('hub');
  } catch (e) {
    return true; // Safe fallback
  }
};

// 🚀 GEOSPATIAL SECTOR EXPANDER (deterministic structural permutation, intelligent about location shape)
// NOTE: this previously made a live DuckDuckGo fetch whose response was never read before falling
// through to the same hardcoded sector templates anyway — and the eco / "live-success" / network-error
// branches had drifted into three differently-worded template lists for what is conceptually one
// fallback. There's no real geospatial lookup happening here, so there's now exactly one template set,
// chosen intelligently based on whether the location looks like "City" vs "Area, City". lowPowerMode
// only controls how many sectors get generated (3-4 vs 5), not which wording is used.
export const expandGeoMatrix = async (baseLocation: string, lowPowerMode: boolean = false): Promise<string[]> => {
  const cleanLoc = baseLocation.trim();
  const sectors = new Set<string>();
  sectors.add(cleanLoc); // Always include base location first

  broadcast('info', `Generating geospatial sector permutations for [${cleanLoc}]...`, 'AI Core');

  const isMultiPart = cleanLoc.split(',').length > 1;
  if (isMultiPart) {
    const cityPart = cleanLoc.split(',')[1]?.trim() || cleanLoc;
    sectors.add(`Surrounding areas of ${cleanLoc}`);
    sectors.add(`Main Commercial Zone, ${cityPart}`);
    if (!lowPowerMode) {
      sectors.add(`Nearby sectors to ${cleanLoc}`);
      sectors.add(`Outer Ring Road corridors near ${cleanLoc}`);
    }
  } else {
    sectors.add(`Central ${cleanLoc}`);
    sectors.add(`Commercial Hubs of ${cleanLoc}`);
    sectors.add(`Suburbs and Outskirts of ${cleanLoc}`);
    if (!lowPowerMode) {
      sectors.add(`Financial District ${cleanLoc}`);
      sectors.add(`IT Parks and Corridors ${cleanLoc}`);
    }
  }

  const expandedList = Array.from(sectors);
  broadcast('success', `🗺️ Generated ${expandedList.length} geospatial permutation sectors for [${baseLocation}]${lowPowerMode ? ' (Eco Mode)' : ''}.`, 'AI Core');
  return expandedList;
};

export const generateAdvancedKeywordMatrix = async (profession: string, location: string, lowPowerMode: boolean = false): Promise<string[]> => {
  return generateQueryMatrix(profession, location, lowPowerMode);
};