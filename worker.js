export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // OPTIONS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 🔹 Hash-Check gegen bekannte schwache Passwörter
    if (url.pathname === "/check" && request.method === "POST") {
      const data = await request.json();
      const hash = data.hash;

      if (!hash) {
        return new Response(JSON.stringify({ error: "hash required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      // Prüfe ob Hash in der WEAK_PASSWORDS KV ist
      const isWeak = await env.WEAK_PASSWORDS.get(hash);

      return new Response(JSON.stringify({
        isWeak: isWeak !== null
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // 🔹 Statistik endpoint - Anonyme Bewertungsergebnisse
    if (url.pathname === "/analyze" && request.method === "POST") {
      const data = await request.json();

      // Passwort-Länge in Bucket
      const len = data.length || 0;
      const lengthBucket = len <= 7 ? "0-7" : len <= 12 ? "8-12" : "13+";

      // Score in Buckets (0-100 Punkte System)
      const score = data.score || 0;
      const scoreBucket = score < 50 ? "poor" : score < 70 ? "fair" : score < 85 ? "good" : "excellent";

      // Tageszeit
      const hour = new Date().getHours();
      const timeBucket = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

      // KV speichern - Neue Bewertungsfelder
      await increment(env, "length_" + lengthBucket);
      await increment(env, "score_" + scoreBucket);
      await increment(env, "upper_" + data.has_upper);
      await increment(env, "lower_" + data.has_lower);
      await increment(env, "number_" + data.has_number);
      await increment(env, "special_" + data.has_special);
      await increment(env, "repeating_" + data.has_repeating);
      await increment(env, "sequential_" + data.has_sequential);
      await increment(env, "known_weak_" + data.is_known_weak);
      await increment(env, "time_" + timeBucket);

      // TOTAL Counter
      await increment(env, "total");

      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // 🔹 Stats abrufen
    if (url.pathname === "/stats") {
      const keys = [
        "total",
        // Längen-Buckets
        "length_0-7", "length_8-12", "length_13+",
        // Score-Buckets (neu)
        "score_poor", "score_fair", "score_good", "score_excellent",
        // Zeichen-Typen
        "upper_true", "upper_false",
        "lower_true", "lower_false",
        "number_true", "number_false",
        "special_true", "special_false",
        // Muster
        "repeating_true", "repeating_false",
        "sequential_true", "sequential_false",
        // Bekannte schwache Passwörter
        "known_weak_true", "known_weak_false",
        // Tageszeit
        "time_morning", "time_afternoon", "time_evening"
      ];

      const result = {};
      for (const key of keys) {
        const val = await env.COUNTER.get(key);
        result[key] = val ? parseInt(val) : 0;
      }

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response("OK", { headers: corsHeaders });
  }
};

// 🔧 Helper
async function increment(env, key) {
  let val = await env.COUNTER.get(key);
  val = val ? parseInt(val) : 0;
  val++;
  await env.COUNTER.put(key, val.toString());
}
