
const form = document.getElementById("searchForm");
const results = document.getElementById("results");
const gamesSection = document.getElementById("games");
const coachStatsSection = document.getElementById("coachStats");
const status = document.getElementById("status");
const aiAnalysis = document.getElementById("aiAnalysis");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatStatus = document.getElementById("chatStatus");
const chatSubmit = document.getElementById("chatSubmit");


let activeUsername = null;
let activeStats = null;

form.addEventListener("submit", async function(event) 
{
    event.preventDefault();

    const username = document.getElementById("username").value.trim();

    if(!/^[a-zA-Z0-9_-]+$/.test(username)) 
    {
        status.textContent = "Please enter a valid username.";
        return;
    }

    results.replaceChildren();
    gamesSection.replaceChildren();
    status.textContent = "Loading player data...";

    try 
    {
        const base = `https://api.chess.com/pub/player/${encodeURIComponent(username)}`;

        const [profileResponse, statsResponse] = await Promise.all([fetch(base), fetch(`${base}/stats`)]);

        if(!profileResponse.ok) 
        {
            throw new Error("Player not found.");
        }

        if(!statsResponse.ok) 
        {
            throw new Error("Could not retrieve player stats.");
        }

        const profile = await profileResponse.json();
        const stats = await statsResponse.json();

        const card = document.createElement("div");
        card.className = "card";

        const name = document.createElement("h2");
        name.textContent = profile.username || username;
        card.appendChild(name);

        if(profile.avatar) 
        {
            const avatar = document.createElement("img");
            avatar.src = profile.avatar;
            avatar.alt = "Player avatar";
            card.appendChild(avatar);
        }

        const title = document.createElement("p");
        title.textContent = "Title: " + (profile.title || "None");
        card.appendChild(title);

        const ratingHeading = document.createElement("h3");
        ratingHeading.textContent = "Ratings";
        card.appendChild(ratingHeading);

        const ratingTypes = [
            ["chess_bullet", "Bullet"],
            ["chess_blitz", "Blitz"],
            ["chess_rapid", "Rapid"],
            ["chess_daily", "Daily"]
        ];

        activeUsername = username;
        activeStats = stats;

        for(const [key, label] of ratingTypes) 
        {
            const rating = stats[key]?.last?.rating;
            const row = document.createElement("p");
            row.textContent = `${label}: ${rating ?? "No rating available"}`;
            card.appendChild(row);
        }

        const link = document.createElement("a");
        link.href = profile.url || `https://www.chess.com/member/${encodeURIComponent(username)}`;
        link.textContent = "View Chess.com profile";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.appendChild(link);

        results.appendChild(card);
        
        const {coachData, aiCoachData} = await updateGameStatistics();

        status.textContent = "Generating AI coaching report...";

        const analysis = await getAIChessAnalysis(aiCoachData);

        originalCoachReport = analysis;
        chatHistory = [];

        chatMessages.replaceChildren();

        renderMarkdown(aiAnalysis, analysis);

        status.textContent = `Loaded profile and AI coaching report for ${username}.`;
    } 
    catch(error) 
    {
        status.textContent = error.message || "Something went wrong while retrieving data.";
    }
});

document.getElementById("gameLimit").addEventListener(
    "change",
    async () => 
    {
        if(!activeUsername || !activeStats) 
            return;

        status.textContent = "Updating coaching analysis...";

        try 
        {
            const {coachData, aiCoachData} = await updateGameStatistics();
            const analysis = await getAIChessAnalysis(aiCoachData);

            originalCoachReport = analysis;
            chatHistory = [];

            chatMessages.replaceChildren();

            renderMarkdown(aiAnalysis, analysis);

            status.textContent = "Coaching analysis updated.";
        } 
        catch(error) 
        {
            status.textContent = error.message || "Could not update coaching analysis.";
        }
    }
);

let originalCoachReport = "";
let chatHistory = [];
let chatBusy = false;

function renderMarkdown(element, markdown) {
    element.innerHTML = DOMPurify.sanitize(
        marked.parse(markdown)
    );
}

function addChatMessage(role, content) {
    const placeholder = chatMessages.querySelector(
        ".chat-placeholder"
    );

    if (placeholder) {
        placeholder.remove();
    }

    const message = document.createElement("div");
    message.className = `chat-message ${role}`;

    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent =
        role === "user" ? "You" : "Chess Coach";

    const body = document.createElement("div");
    body.className = "message-body";

    if (role === "assistant") {
        renderMarkdown(body, content);
    } else {
        body.textContent = content;
    }

    message.append(label, body);
    chatMessages.appendChild(message);

    return body;
}

chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const question = chatInput.value.trim();

    if (!question || chatBusy) return;

    if (!originalCoachReport) {
        chatStatus.textContent =
            "Generate your coaching report first.";
        return;
    }

    chatBusy = true;
    chatSubmit.disabled = true;
    chatInput.disabled = true;
    chatStatus.textContent = "Coach is thinking...";

    addChatMessage("user", question);
    chatInput.value = "";

    const previousHistory = [...chatHistory];

    try {
        const prompt = `
You are an expert chess coach helping a player improve.

Use the original coaching report and conversation below
as context. Answer the player's latest question directly.

Rules:
- Ground claims in the supplied report and conversation.
- Do not invent game moves, engine evaluations, or statistics.
- Clearly distinguish evidence from hypotheses.
- Use readable Markdown with headings or bullets when useful.
- Give specific, practical advice appropriate to the player's level.

ORIGINAL COACHING REPORT:
${originalCoachReport}

PREVIOUS CONVERSATION:
${previousHistory.map(message =>
    `${message.role === "user" ? "Player" : "Coach"}: ${message.content}`
).join("\n\n")}

PLAYER'S NEW QUESTION:
${question}
`;

        const response = await fetch("/api/coach", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ prompt })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Could not get a response from the coach."
            );
        }

        if (typeof data.analysis !== "string" ||
            !data.analysis.trim()) {
            throw new Error("The coach returned an empty response.");
        }

        chatHistory.push(
            { role: "user", content: question },
            { role: "assistant", content: data.analysis }
        );

        addChatMessage("assistant", data.analysis);

        chatStatus.textContent = "";
    } catch (error) {
        console.error("Follow-up chat error:", error);
        chatStatus.textContent = error.message;

        chatInput.value = question;
    } finally {
        chatBusy = false;
        chatSubmit.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
});



async function updateGameStatistics() 
{
    const selectedLimit = document.getElementById("gameLimit").value;

    const limit = selectedLimit === "all" ? Infinity : Number(selectedLimit);

    const games = await getRecentGames(activeUsername, limit);

    const coachData = buildCoachData(activeUsername, activeStats, games);

    displayCoachStats(coachData);
    displayGames(games.slice(0, 10));

    const aiCoachData = {
        ...coachData,
        recentGames: coachData.recentGames.slice(0, 100),
        aiSampleSize: Math.min(coachData.sampleSize, 100)
    };

    return {
        coachData,
        aiCoachData
    };
}



async function getRecentGames(username, limit = 10) {
    const base = `https://api.chess.com/pub/player/${encodeURIComponent(username)}`;

    const archiveResponse = await fetch(`${base}/games/archives`);

    if(!archiveResponse.ok) 
    {
        throw new Error("Could not retrieve game archives.");
    }

    const archiveData = await archiveResponse.json();
    const archives = archiveData.archives || [];

    if(archives.length === 0) 
    {
        return [];
    }

    const allGames = [];

    for(let i = archives.length - 1; i >= 0; i--) 
    {
        const gamesResponse = await fetch(archives[i]);

        if(!gamesResponse.ok) 
        {
            throw new Error("Could not retrieve archived games.");
        }

        const gameData = await gamesResponse.json();
        allGames.push(...(gameData.games || []));

        if(allGames.length >= limit) 
        {
            break;
        }
    }

    const selectedGames = allGames.sort((a, b) => b.end_time - a.end_time).slice(0, limit);

    return selectedGames.map(game => 
    {
        const isWhite = game.white.username.toLowerCase() === username.toLowerCase();

        const player = isWhite ? game.white : game.black;
        const opponent = isWhite ? game.black : game.white;

        return {
            url: game.url,
            date: new Date(game.end_time * 1000).toLocaleDateString(),
            color: isWhite ? "White" : "Black",
            opponent: opponent.username,
            opponentRating: opponent.rating,
            player: player.username,
            playerRating: player.rating,
            result: player.result,
            timeClass: game.time_class,
            pgn: game.pgn,
            accuracy: game.accuracies?.[isWhite ? "white" : "black"] ?? null,
            eco: game.eco ?? null,
            rated: game.rated ?? null,
            timeControl: game.time_control ?? null,
            termination: game.end_time || null
        };
    });
}


function displayGames(games) 
{
    gamesSection.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = "Recent Games";
    gamesSection.appendChild(heading);

    if(games.length === 0) 
    {
        const message = document.createElement("p");
        message.textContent = "No games found in the latest archive.";
        gamesSection.appendChild(message);
        return;
    }

    for(const game of games) 
    {
        const card = document.createElement("div");
        card.className = "game";

        const players = document.createElement("h3");
        players.textContent = `${game.player} vs. ${game.opponent} (${game.opponentRating})`;

        const details = document.createElement("p");
        details.textContent = `${game.date} | ${game.timeClass || "Chess"} | ` + `Result: ${game.result}`;

        const link = document.createElement("a");
        link.href = game.url;
        link.textContent = "View game on Chess.com";
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        card.append(players, details, link);
        gamesSection.appendChild(card);
    }
}


function buildCoachData(username, stats, games) 
{
    const ratingTypes = [
        ["chess_bullet", "Bullet"],
        ["chess_blitz", "Blitz"],
        ["chess_rapid", "Rapid"],
        ["chess_daily", "Daily"]
    ];

    const ratings = Object.fromEntries(
        ratingTypes.map(([key, label]) => {
            const data = stats[key] || {};
            const record = data.record || {};

            return [label, {
                currentRating: data.last?.rating ?? null,
                peakRating: Math.max(
                    data.best?.rating ?? 0,
                    data.last?.rating ?? 0
                ) || null,
                wins: record.win ?? 0,
                losses: record.loss ?? 0,
                draws: record.draw ?? 0,
                timeoutPercent: record.timeout_percent ?? null
            }];
        })
    );

    const total = games.length;

    const wins = games.filter(g => g.result === "win").length;
    const draws = games.filter(g => isDrawResult(g.result)).length;
    const losses = games.filter(g => g.result !== "win" && !isDrawResult(g.result)).length;

    const accuracyValues = games.map(g => g.accuracy).filter(Number.isFinite);

    const averageAccuracy = accuracyValues.length ? accuracyValues.reduce((sum, n) => sum + n, 0) / accuracyValues.length : null;

    const byTimeControl = {};

    for(const game of games) 
    {
        const key = game.timeClass || "unknown";

        if(!byTimeControl[key]) 
        {
            byTimeControl[key] = 
            {
                games: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                accuracy: []
            };
        }

        const group = byTimeControl[key];
        group.games++;

        if(game.result === "win")
            group.wins++;
        else if(isDrawResult(game.result))
            group.draws++;
        else
            group.losses++;

        if(Number.isFinite(game.accuracy)) 
        {
            group.accuracy.push(game.accuracy);
        }
    }

    for(const group of Object.values(byTimeControl)) 
    {
        group.averageAccuracy = group.accuracy.length ? group.accuracy.reduce((a, b) => a + b, 0) / group.accuracy.length : null;

        delete group.accuracy;
    }

    const openings = {};

    for(const game of games) 
    {
        const opening = game.eco || "Unknown";

        if(!openings[opening]) 
        {
            openings[opening] = 
            {
                games: 0,
                wins: 0,
                draws: 0,
                losses: 0
            };
        }

        const group = openings[opening];
        group.games++;

        if(game.result === "win") 
            group.wins++;
        else if(game.result === "agreed") 
            group.draws++;
        else 
            group.losses++;
    }

    return {
        username,
        source: "Chess.com PubAPI",
        sampleSize: total,
        overall: {wins, draws, losses, winRate: total ? wins / total : null, averageAccuracy},
        ratings,
        byTimeControl,
        openings,
        recentGames: games.map(game => ({
            date: game.date,
            color: game.color,
            opponent: game.opponent,
            opponentRating: game.opponentRating,
            playerRating: game.playerRating,
            result: game.result,
            timeClass: game.timeClass,
            accuracy: game.accuracy ?? null,
            openingECO: game.eco ?? null,
            pgn: game.pgn ?? null,
            url: game.url
        }))
    };
}


function displayCoachStats(data) 
{
    coachStatsSection.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = "Chess Improvement Statistics";
    coachStatsSection.appendChild(heading);

    const overallHeading = document.createElement("h3");
    overallHeading.textContent = "Recent Performance";
    coachStatsSection.appendChild(overallHeading);

    const accuracy = data.overall.averageAccuracy;
    const winRate = data.overall.winRate;

    const overallItems = [
        `Games analyzed: ${data.sampleSize}`,
        `Wins: ${data.overall.wins}`,
        `Draws: ${data.overall.draws}`,
        `Losses: ${data.overall.losses}`,
        `Win rate: ${winRate === null ? "N/A" : (winRate * 100).toFixed(1) + "%"}`,
        `Average accuracy: ${accuracy === null ? "N/A" : accuracy.toFixed(1) + "%"}`
    ];

    for(const item of overallItems) 
    {
        const p = document.createElement("p");
        p.textContent = item;
        coachStatsSection.appendChild(p);
    }

    const timeHeading = document.createElement("h3");
    timeHeading.textContent = "Performance by Time Control";
    coachStatsSection.appendChild(timeHeading);

    for (const [timeClass, group] of Object.entries(data.byTimeControl)) {
        const section = document.createElement("div");
        section.className = "stat-group";

        const title = document.createElement("h4");
        title.textContent = timeClass.toUpperCase();
        section.appendChild(title);

        const winRate = group.games ? (group.wins / group.games * 100).toFixed(1) + "%" : "N/A";

        const avgAccuracy = group.averageAccuracy === null ? "N/A" : group.averageAccuracy.toFixed(1) + "%";

        const details = document.createElement("p");
        details.textContent = `Games: ${group.games} | Wins: ${group.wins} | ` + `Draws: ${group.draws} | Losses: ${group.losses}`;

        const performance = document.createElement("p");
        performance.textContent = `Win rate: ${winRate} | Average accuracy: ${avgAccuracy}`;

        section.append(details, performance);
        coachStatsSection.appendChild(section);
    }

    const ratingHeading = document.createElement("h3");
    ratingHeading.textContent = "Rating Statistics";
    coachStatsSection.appendChild(ratingHeading);

    for(const [format, rating] of Object.entries(data.ratings)) 
    {
        const p = document.createElement("p");

        p.textContent = `${format}: Current ${rating.currentRating ?? "N/A"} | ` + `Peak ${rating.peakRating ?? "N/A"} | ` + `Record: ${rating.wins}-${rating.losses}-${rating.draws}`;

        coachStatsSection.appendChild(p);
    }

    const jsonButton = document.createElement("button");
    jsonButton.textContent = "View Raw Coaching Data";

    const jsonOutput = document.createElement("pre");
    jsonOutput.hidden = true;

    jsonButton.addEventListener("click", () => {
        jsonOutput.hidden = !jsonOutput.hidden;
        jsonButton.textContent = jsonOutput.hidden ? "View Raw Coaching Data" : "Hide Raw Coaching Data";
    });

    jsonOutput.textContent = JSON.stringify(data, null, 2);

    coachStatsSection.append(jsonButton, jsonOutput);
}

function isDrawResult(result) 
{
    const drawResults = new Set([
        "agreed",
        "repetition",
        "stalemate",
        "insufficient",
        "50move",
        "timevsinsufficient",
        "draw"
    ]);

    return drawResults.has(result);
}


function buildCoachPrompt(coachData) 
{
    return `
You are an evidence-driven chess coach and performance analyst.

Your task is to interpret the supplied Chess.com player data and
produce a personalized, practical improvement plan.

PLAYER DATA:
${JSON.stringify(coachData, null, 2)}

CORE RULES

1. Use only the supplied data for claims about this player's
   performance. Do not invent statistics, games, ratings, opening
   results, or player tendencies.

2. Distinguish clearly between:
   - Observed findings directly supported by the data.
   - Plausible explanations that have not been verified.
   - Recommendations for further investigation.

3. Evaluate data quality before drawing conclusions. Identify
   missing fields, small samples, inconsistent totals, and other
   limitations that materially affect your analysis.

4. Always report the relevant sample size when discussing a
   statistic. Treat results from small samples as preliminary.
   Do not present a numerical difference as a meaningful trend
   without sufficient supporting evidence.

5. Interpret results in context. Consider opponent ratings,
   playing color, time control, and other available variables.
   Do not attribute a result to a particular skill or weakness
   when the data does not support that explanation.

6. Distinguish wins, draws, and losses correctly. Do not infer
   game outcomes from incomplete or ambiguous result data.
   Check whether reported totals are consistent before relying
   on them.

PERFORMANCE ANALYSIS

7. Summarize overall performance using the available game counts,
   results, ratings, and accuracy measurements.

8. Compare time controls only when there is enough data to make
   the comparison useful. Report sample sizes and note relevant
   differences in opponent strength or other confounding factors.

9. Treat Chess.com accuracy as a platform-specific metric, not
   a direct measurement of playing strength. Avoid assuming that
   accuracy values are directly comparable across all time controls
   or game types.

10. Evaluate openings using games played, results, color, opponent
    ratings, and other available information. Do not recommend
    abandoning an opening based on win rate alone. Separate
    observed personal performance from general opening theory.

GAME ANALYSIS

11. Examine individual game records only to the extent supported
    by the supplied information.

12. A game result, rating, accuracy score, or PGN alone does not
    establish the exact cause of a win or loss.

13. Do not claim to have identified blunders, missed tactics,
    forced wins, or positional mistakes unless the supplied
    analysis supports that conclusion.

14. If engine evaluations or move-level annotations are provided,
    use them cautiously and reference the relevant move or
    evaluation when possible. Do not invent engine evaluations
    or principal variations.

15. If PGNs are available without engine analysis, identify useful
    candidate games for review and explain why they are worth
    studying. Label these as candidates, not confirmed examples
    of mistakes.

16. Look for recurring patterns only when multiple relevant games
    support them. Distinguish repeated evidence from isolated
    incidents.

RECOMMENDATIONS

17. Recommend exactly three training activities, ranked from
    highest to lowest expected benefit.

18. For each activity, provide:
    - The skill being targeted.
    - The evidence motivating the recommendation.
    - A specific exercise or method.
    - Frequency and duration.
    - A measurable way to evaluate progress.
    - A reason to revise the recommendation if progress stalls.

19. Make the plan realistic for a player with limited training
    time. Prioritize a few high-value activities over an excessive
    list of exercises.

20. Where evidence is insufficient to identify a specific
    weakness, recommend a diagnostic exercise rather than
    presenting a guess as a fact.

21. Recommend additional measurements that would improve future
    coaching, such as engine evaluations, move-level mistakes,
    tactical themes, clock usage, and performance against
    similarly rated opponents, when relevant.

REPORT FORMAT

## Player Overview
Summarize the available performance data, sample size, and
the most important evidence-supported conclusions.

## Strengths
List strengths supported by the data. Explain the evidence and
identify any important limitations.

## Areas for Improvement
Prioritize the most promising improvement areas. Separate
confirmed patterns from hypotheses requiring verification.

## Opening Recommendations
Discuss promising openings, openings worth reviewing, and
limitations caused by sample size, color, or opponent strength.

## Tactical and Positional Study Plan
Recommend relevant study methods. Identify candidate games for
review when move-level analysis is unavailable. Do not fabricate
specific mistakes or tactical patterns.

## Weekly Training Schedule
Provide a practical seven-day schedule with specific activities,
durations, and a balanced workload. Include rest or review time
where appropriate.

## Evidence and Limitations
Summarize the strongest supporting evidence, the major
uncertainties, missing data, and additional measurements that
would make future recommendations more reliable.

## Next Steps
Give the player three concrete actions to begin with, in priority
order.

STYLE

- Be specific, constructive, and direct.
- Explain why each major recommendation follows from the data.
- Use numbers and examples when available.
- Avoid generic advice that could apply to any chess player.
- Do not overstate confidence or imply that correlation proves
  causation.
- If the data cannot support a conclusion, say so explicitly.
`;
}

async function getAIChessAnalysis(coachData) 
{
    const prompt = buildCoachPrompt(coachData);

    const response = await fetch("/api/coach", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt })
    });

    if(!response.ok) 
    {
        const error = await response.json().catch(() => ({}));
        throw new Error(
            error.error || "Could not generate AI analysis."
        );
    }

    const data = await response.json();
    return data.analysis;
}