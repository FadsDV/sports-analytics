import { Game } from "./types";

// ---------------------------------------------------------------------------
// SOCCER — Premier League
// ---------------------------------------------------------------------------

const soccerGames: Game[] = [
  {
    id: "soc-001",
    sport: "soccer",
    status: "live",
    kickoff: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    venue: "Anfield",
    city: "Liverpool, England",
    score: { home: 2, away: 1 },
    liveMinute: 55,
    weather: { condition: "Cloudy", tempC: 14, windKph: 22, humidity: 75 },
    homeTeam: {
      name: "Liverpool",
      shortName: "LIV",
      logo: "🔴",
      form: ["W", "W", "D", "W", "L"],
      record: { wins: 19, losses: 4, draws: 5 },
      splits: {
        home: { wins: 12, losses: 1, draws: 2 },
        away: { wins: 7, losses: 3, draws: 3 },
      },
      players: [
        {
          name: "Mohamed Salah",
          position: "RW",
          stats: { goals: 18, assists: 11, shots_pg: 3.4, rating: 8.1 },
          injured: false,
        },
        {
          name: "Virgil van Dijk",
          position: "CB",
          stats: { tackles: 2.1, interceptions: 1.8, aerials_won: 4.2, rating: 7.6 },
          injured: false,
        },
        {
          name: "Dominik Szoboszlai",
          position: "CM",
          stats: { goals: 5, assists: 7, key_passes: 2.3, rating: 7.2 },
          injured: true,
          injuryNote: "Hamstring — doubtful",
        },
        {
          name: "Alisson Becker",
          position: "GK",
          stats: { saves_pg: 2.8, clean_sheets: 9, rating: 7.9 },
          injured: false,
        },
      ],
    },
    awayTeam: {
      name: "Arsenal",
      shortName: "ARS",
      logo: "🔴",
      form: ["W", "W", "W", "L", "W"],
      record: { wins: 20, losses: 3, draws: 5 },
      splits: {
        home: { wins: 13, losses: 0, draws: 2 },
        away: { wins: 7, losses: 3, draws: 3 },
      },
      players: [
        {
          name: "Bukayo Saka",
          position: "RW",
          stats: { goals: 14, assists: 13, shots_pg: 2.8, rating: 8.3 },
          injured: false,
        },
        {
          name: "Martin Ødegaard",
          position: "CM",
          stats: { goals: 8, assists: 10, key_passes: 3.1, rating: 8.0 },
          injured: true,
          injuryNote: "Ankle — out 2 weeks",
        },
        {
          name: "Gabriel Martinelli",
          position: "LW",
          stats: { goals: 9, assists: 6, dribbles: 2.4, rating: 7.4 },
          injured: false,
        },
        {
          name: "David Raya",
          position: "GK",
          stats: { saves_pg: 2.4, clean_sheets: 11, rating: 7.8 },
          injured: false,
        },
      ],
    },
    h2h: [
      { date: "2024-12-23", homeTeam: "Arsenal", awayTeam: "Liverpool", score: "1-1", winner: "Draw" },
      { date: "2024-04-14", homeTeam: "Liverpool", awayTeam: "Arsenal", score: "2-2", winner: "Draw" },
      { date: "2023-12-23", homeTeam: "Arsenal", awayTeam: "Liverpool", score: "1-0", winner: "Arsenal" },
      { date: "2023-04-09", homeTeam: "Liverpool", awayTeam: "Arsenal", score: "2-2", winner: "Draw" },
      { date: "2022-10-09", homeTeam: "Arsenal", awayTeam: "Liverpool", score: "3-2", winner: "Arsenal" },
    ],
    betRisk: {
      level: "Medium",
      score: 52,
      factors: [
        { label: "Liverpool form (last 5)", value: "W W D W L", impact: "positive" },
        { label: "Arsenal form (last 5)", value: "W W W L W", impact: "positive" },
        { label: "Arsenal key injury", value: "Ødegaard out", impact: "negative" },
        { label: "Liverpool home record", value: "12W 1L 2D", impact: "positive" },
        { label: "H2H last 5", value: "2 Arsenal, 3 Draws", impact: "neutral" },
        { label: "Weather", value: "Cloudy, light wind", impact: "neutral" },
      ],
      summary:
        "Both sides in strong form but Arsenal missing their creative hub Ødegaard. Liverpool's home fortress gives them a narrow edge. H2H trends toward tight, draw-heavy encounters — backing a decisive result carries moderate risk.",
    },
  },
  {
    id: "soc-002",
    sport: "soccer",
    status: "upcoming",
    kickoff: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    venue: "Etihad Stadium",
    city: "Manchester, England",
    weather: { condition: "Rain", tempC: 11, windKph: 35, humidity: 88 },
    homeTeam: {
      name: "Man City",
      shortName: "MCI",
      logo: "🔵",
      form: ["L", "W", "W", "L", "W"],
      record: { wins: 16, losses: 7, draws: 5 },
      splits: {
        home: { wins: 11, losses: 2, draws: 2 },
        away: { wins: 5, losses: 5, draws: 3 },
      },
      players: [
        {
          name: "Erling Haaland",
          position: "ST",
          stats: { goals: 22, assists: 4, shots_pg: 4.1, rating: 8.4 },
          injured: false,
        },
        {
          name: "Kevin De Bruyne",
          position: "CM",
          stats: { goals: 4, assists: 14, key_passes: 3.8, rating: 8.2 },
          injured: true,
          injuryNote: "Thigh strain — questionable",
        },
        {
          name: "Phil Foden",
          position: "AM",
          stats: { goals: 11, assists: 8, dribbles: 2.1, rating: 7.8 },
          injured: false,
        },
      ],
    },
    awayTeam: {
      name: "Chelsea",
      shortName: "CHE",
      logo: "🔵",
      form: ["W", "L", "W", "W", "L"],
      record: { wins: 14, losses: 9, draws: 5 },
      splits: {
        home: { wins: 9, losses: 3, draws: 3 },
        away: { wins: 5, losses: 6, draws: 2 },
      },
      players: [
        {
          name: "Cole Palmer",
          position: "AM",
          stats: { goals: 16, assists: 10, key_passes: 3.2, rating: 8.1 },
          injured: false,
        },
        {
          name: "Nicolas Jackson",
          position: "ST",
          stats: { goals: 12, assists: 5, shots_pg: 2.9, rating: 7.3 },
          injured: false,
        },
        {
          name: "Reece James",
          position: "RB",
          stats: { assists: 3, tackles: 2.4, crosses: 3.1, rating: 7.1 },
          injured: true,
          injuryNote: "Knee — out 3 weeks",
        },
      ],
    },
    h2h: [
      { date: "2024-11-10", homeTeam: "Chelsea", awayTeam: "Man City", score: "1-1", winner: "Draw" },
      { date: "2024-02-17", homeTeam: "Man City", awayTeam: "Chelsea", score: "1-0", winner: "Man City" },
      { date: "2023-11-12", homeTeam: "Chelsea", awayTeam: "Man City", score: "4-4", winner: "Draw" },
      { date: "2023-01-08", homeTeam: "Man City", awayTeam: "Chelsea", score: "1-0", winner: "Man City" },
      { date: "2022-08-21", homeTeam: "Chelsea", awayTeam: "Man City", score: "1-0", winner: "Chelsea" },
    ],
    betRisk: {
      level: "High",
      score: 68,
      factors: [
        { label: "Man City form (last 5)", value: "L W W L W — inconsistent", impact: "negative" },
        { label: "De Bruyne fitness", value: "Questionable start", impact: "negative" },
        { label: "Heavy rain forecast", value: "35 kph winds, rain", impact: "negative" },
        { label: "Chelsea away record", value: "5W 6L 2D — poor travellers", impact: "positive" },
        { label: "H2H last 5", value: "City 2, Chelsea 1, Draws 2", impact: "neutral" },
        { label: "Haaland available", value: "22 goals this season", impact: "positive" },
      ],
      summary:
        "City's recent inconsistency combined with De Bruyne's fitness doubt and wet, windy conditions create genuine uncertainty. Chelsea struggle away from home. High risk due to form volatility — weather could neutralise City's technical game.",
    },
  },
  {
    id: "soc-003",
    sport: "soccer",
    status: "finished",
    kickoff: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    venue: "Old Trafford",
    city: "Manchester, England",
    score: { home: 0, away: 3 },
    weather: { condition: "Clear", tempC: 16, windKph: 10, humidity: 60 },
    homeTeam: {
      name: "Man United",
      shortName: "MUN",
      logo: "🔴",
      form: ["L", "L", "L", "W", "L"],
      record: { wins: 9, losses: 16, draws: 3 },
      splits: {
        home: { wins: 6, losses: 7, draws: 1 },
        away: { wins: 3, losses: 9, draws: 2 },
      },
      players: [
        {
          name: "Rasmus Højlund",
          position: "ST",
          stats: { goals: 8, assists: 2, shots_pg: 2.1, rating: 6.4 },
          injured: false,
        },
        {
          name: "Bruno Fernandes",
          position: "AM",
          stats: { goals: 7, assists: 8, key_passes: 2.7, rating: 6.9 },
          injured: false,
        },
      ],
    },
    awayTeam: {
      name: "Tottenham",
      shortName: "TOT",
      logo: "⚪",
      form: ["W", "W", "L", "W", "W"],
      record: { wins: 17, losses: 7, draws: 4 },
      splits: {
        home: { wins: 11, losses: 2, draws: 2 },
        away: { wins: 6, losses: 5, draws: 2 },
      },
      players: [
        {
          name: "Son Heung-min",
          position: "LW",
          stats: { goals: 15, assists: 9, shots_pg: 2.8, rating: 7.9 },
          injured: false,
        },
        {
          name: "Dejan Kulusevski",
          position: "RW",
          stats: { goals: 8, assists: 11, dribbles: 2.6, rating: 7.7 },
          injured: false,
        },
      ],
    },
    h2h: [
      { date: "2024-01-14", homeTeam: "Tottenham", awayTeam: "Man United", score: "2-2", winner: "Draw" },
      { date: "2023-08-19", homeTeam: "Man United", awayTeam: "Tottenham", score: "2-0", winner: "Man United" },
      { date: "2023-04-27", homeTeam: "Tottenham", awayTeam: "Man United", score: "2-2", winner: "Draw" },
      { date: "2022-10-19", homeTeam: "Man United", awayTeam: "Tottenham", score: "2-0", winner: "Man United" },
      { date: "2022-03-12", homeTeam: "Tottenham", awayTeam: "Man United", score: "3-2", winner: "Tottenham" },
    ],
    betRisk: {
      level: "Low",
      score: 28,
      factors: [
        { label: "United form (last 5)", value: "L L L W L — poor run", impact: "negative" },
        { label: "Spurs form (last 5)", value: "W W L W W — strong", impact: "positive" },
        { label: "Weather", value: "Clear & calm", impact: "positive" },
        { label: "United home record", value: "6W 7L 1D — unusually poor", impact: "negative" },
        { label: "No key injuries", value: "Both squads healthy", impact: "positive" },
      ],
      summary:
        "Spurs entering the game in dominant form against a United side that has won just once in five. Clear weather, no injuries. Backing the away side represented low risk — confirmed by the 3-0 result.",
    },
    boxScore: {
      statHeaders: ["Goals", "Shots", "Shots on Target", "Passes", "Pass Acc %", "Tackles"],
      home: [
        { player: "Rasmus Højlund", stats: { Goals: 0, Shots: 2, "Shots on Target": 0, Passes: 18, "Pass Acc %": "72%", Tackles: 1 } },
        { player: "Bruno Fernandes", stats: { Goals: 0, Shots: 1, "Shots on Target": 0, Passes: 42, "Pass Acc %": "81%", Tackles: 2 } },
        { player: "Marcus Rashford", stats: { Goals: 0, Shots: 3, "Shots on Target": 1, Passes: 24, "Pass Acc %": "67%", Tackles: 0 } },
      ],
      away: [
        { player: "Son Heung-min", stats: { Goals: 2, Shots: 5, "Shots on Target": 3, Passes: 31, "Pass Acc %": "84%", Tackles: 1 } },
        { player: "Dejan Kulusevski", stats: { Goals: 1, Shots: 3, "Shots on Target": 2, Passes: 38, "Pass Acc %": "87%", Tackles: 3 } },
        { player: "James Maddison", stats: { Goals: 0, Shots: 2, "Shots on Target": 1, Passes: 55, "Pass Acc %": "89%", Tackles: 2 } },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// BASKETBALL — NBA
// ---------------------------------------------------------------------------

const basketballGames: Game[] = [
  {
    id: "bball-001",
    sport: "basketball",
    status: "upcoming",
    kickoff: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    venue: "Chase Center",
    city: "San Francisco, CA",
    weather: { condition: "Clear", tempC: 18, windKph: 12, humidity: 65 },
    homeTeam: {
      name: "Golden State Warriors",
      shortName: "GSW",
      logo: "💛",
      form: ["W", "L", "W", "W", "L"],
      record: { wins: 34, losses: 28 },
      splits: {
        home: { wins: 21, losses: 10 },
        away: { wins: 13, losses: 18 },
      },
      players: [
        {
          name: "Stephen Curry",
          position: "PG",
          stats: { ppg: 28.4, apg: 6.1, rpg: 4.3, fg_pct: "44.8%", three_pct: "41.2%" },
          injured: false,
        },
        {
          name: "Draymond Green",
          position: "PF",
          stats: { ppg: 9.1, apg: 6.7, rpg: 7.2, fg_pct: "48.3%", three_pct: "28.0%" },
          injured: false,
        },
        {
          name: "Klay Thompson",
          position: "SG",
          stats: { ppg: 17.9, apg: 2.4, rpg: 3.3, fg_pct: "43.2%", three_pct: "38.7%" },
          injured: true,
          injuryNote: "Left ankle sprain — questionable",
        },
      ],
    },
    awayTeam: {
      name: "Denver Nuggets",
      shortName: "DEN",
      logo: "💙",
      form: ["W", "W", "W", "L", "W"],
      record: { wins: 44, losses: 18 },
      splits: {
        home: { wins: 26, losses: 5 },
        away: { wins: 18, losses: 13 },
      },
      players: [
        {
          name: "Nikola Jokić",
          position: "C",
          stats: { ppg: 27.1, apg: 9.8, rpg: 12.4, fg_pct: "57.2%", three_pct: "36.1%" },
          injured: false,
        },
        {
          name: "Jamal Murray",
          position: "PG",
          stats: { ppg: 21.3, apg: 6.5, rpg: 3.8, fg_pct: "46.1%", three_pct: "39.4%" },
          injured: false,
        },
        {
          name: "Aaron Gordon",
          position: "PF",
          stats: { ppg: 14.2, apg: 3.1, rpg: 6.5, fg_pct: "52.8%", three_pct: "33.0%" },
          injured: true,
          injuryNote: "Back soreness — probable",
        },
      ],
    },
    h2h: [
      { date: "2024-11-19", homeTeam: "Denver Nuggets", awayTeam: "Golden State Warriors", score: "120-114", winner: "Denver Nuggets" },
      { date: "2024-01-25", homeTeam: "Golden State Warriors", awayTeam: "Denver Nuggets", score: "130-127", winner: "Golden State Warriors" },
      { date: "2023-12-25", homeTeam: "Denver Nuggets", awayTeam: "Golden State Warriors", score: "108-98", winner: "Denver Nuggets" },
      { date: "2023-04-02", homeTeam: "Golden State Warriors", awayTeam: "Denver Nuggets", score: "116-107", winner: "Golden State Warriors" },
      { date: "2023-01-17", homeTeam: "Denver Nuggets", awayTeam: "Golden State Warriors", score: "122-118", winner: "Denver Nuggets" },
    ],
    betRisk: {
      level: "Medium",
      score: 55,
      factors: [
        { label: "Denver form (last 5)", value: "W W W L W — dominant", impact: "positive" },
        { label: "Jokić availability", value: "Healthy, averaging 27/10/9", impact: "positive" },
        { label: "GSW home court", value: "21-10 at Chase Center", impact: "positive" },
        { label: "Klay Thompson status", value: "Ankle — questionable", impact: "negative" },
        { label: "H2H last 5", value: "Denver 3, GSW 2", impact: "negative" },
        { label: "Denver away record", value: "18-13 on the road", impact: "neutral" },
      ],
      summary:
        "Denver's league-best record and Jokić's MVP-level play make them the form side, but Golden State's home court advantage and Curry's ability to go off any night keeps this competitive. Medium risk — Klay's status is the key variable.",
    },
  },
  {
    id: "bball-002",
    sport: "basketball",
    status: "finished",
    kickoff: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    venue: "TD Garden",
    city: "Boston, MA",
    score: { home: 118, away: 105 },
    weather: { condition: "Snowy", tempC: 1, windKph: 18, humidity: 80 },
    homeTeam: {
      name: "Boston Celtics",
      shortName: "BOS",
      logo: "🍀",
      form: ["W", "W", "W", "W", "L"],
      record: { wins: 48, losses: 14 },
      splits: {
        home: { wins: 28, losses: 4 },
        away: { wins: 20, losses: 10 },
      },
      players: [
        {
          name: "Jayson Tatum",
          position: "SF",
          stats: { ppg: 27.8, apg: 4.6, rpg: 8.3, fg_pct: "46.8%", three_pct: "37.5%" },
          injured: false,
        },
        {
          name: "Jaylen Brown",
          position: "SG",
          stats: { ppg: 22.6, apg: 3.5, rpg: 5.7, fg_pct: "48.0%", three_pct: "36.2%" },
          injured: false,
        },
      ],
    },
    awayTeam: {
      name: "Miami Heat",
      shortName: "MIA",
      logo: "🔥",
      form: ["L", "L", "W", "L", "W"],
      record: { wins: 28, losses: 34 },
      splits: {
        home: { wins: 18, losses: 13 },
        away: { wins: 10, losses: 21 },
      },
      players: [
        {
          name: "Bam Adebayo",
          position: "C",
          stats: { ppg: 19.3, apg: 3.2, rpg: 10.1, fg_pct: "52.4%", three_pct: "0%" },
          injured: false,
        },
        {
          name: "Tyler Herro",
          position: "SG",
          stats: { ppg: 20.7, apg: 4.4, rpg: 4.8, fg_pct: "44.1%", three_pct: "38.9%" },
          injured: true,
          injuryNote: "Groin — out",
        },
      ],
    },
    h2h: [
      { date: "2024-12-31", homeTeam: "Miami Heat", awayTeam: "Boston Celtics", score: "103-111", winner: "Boston Celtics" },
      { date: "2024-11-02", homeTeam: "Boston Celtics", awayTeam: "Miami Heat", score: "120-117", winner: "Boston Celtics" },
      { date: "2024-03-11", homeTeam: "Miami Heat", awayTeam: "Boston Celtics", score: "112-108", winner: "Miami Heat" },
      { date: "2023-12-29", homeTeam: "Boston Celtics", awayTeam: "Miami Heat", score: "130-107", winner: "Boston Celtics" },
      { date: "2023-04-21", homeTeam: "Miami Heat", awayTeam: "Boston Celtics", score: "123-116", winner: "Miami Heat" },
    ],
    betRisk: {
      level: "Low",
      score: 22,
      factors: [
        { label: "Boston form (last 5)", value: "W W W W L — near perfect", impact: "positive" },
        { label: "Herro out for Miami", value: "20+ ppg scorer absent", impact: "negative" },
        { label: "Boston home fortress", value: "28W 4L at TD Garden", impact: "positive" },
        { label: "Miami away record", value: "10W 21L on road", impact: "negative" },
        { label: "H2H last 5", value: "Boston 3, Miami 2", impact: "positive" },
      ],
      summary:
        "Boston clearly the right pick — best home record in the league, Miami missing Herro, and strong H2H advantage. Risk was low, result confirms: Celtics won comfortably 118-105.",
    },
    boxScore: {
      statHeaders: ["PTS", "REB", "AST", "STL", "BLK", "+/-"],
      home: [
        { player: "Jayson Tatum", stats: { PTS: 34, REB: 9, AST: 5, STL: 2, BLK: 1, "+/-": "+18" } },
        { player: "Jaylen Brown", stats: { PTS: 26, REB: 6, AST: 3, STL: 1, BLK: 0, "+/-": "+14" } },
        { player: "Al Horford", stats: { PTS: 12, REB: 8, AST: 4, STL: 0, BLK: 2, "+/-": "+10" } },
      ],
      away: [
        { player: "Bam Adebayo", stats: { PTS: 24, REB: 11, AST: 3, STL: 1, BLK: 2, "+/-": "-12" } },
        { player: "Jimmy Butler", stats: { PTS: 20, REB: 5, AST: 4, STL: 2, BLK: 0, "+/-": "-8" } },
        { player: "Caleb Martin", stats: { PTS: 14, REB: 4, AST: 1, STL: 1, BLK: 0, "+/-": "-15" } },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// NFL
// ---------------------------------------------------------------------------

const nflGames: Game[] = [
  {
    id: "nfl-001",
    sport: "nfl",
    status: "upcoming",
    kickoff: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    venue: "SoFi Stadium",
    city: "Inglewood, CA",
    weather: { condition: "Clear", tempC: 24, windKph: 8, humidity: 55 },
    homeTeam: {
      name: "LA Rams",
      shortName: "LAR",
      logo: "🐏",
      form: ["W", "W", "L", "W", "W"],
      record: { wins: 10, losses: 7 },
      splits: {
        home: { wins: 6, losses: 3 },
        away: { wins: 4, losses: 4 },
      },
      players: [
        {
          name: "Matthew Stafford",
          position: "QB",
          stats: { pass_yds: 3972, tds: 24, ints: 11, rating: 91.3 },
          injured: false,
        },
        {
          name: "Cooper Kupp",
          position: "WR",
          stats: { receptions: 67, rec_yds: 884, tds: 7, targets: 94 },
          injured: true,
          injuryNote: "Hamstring — IR",
        },
        {
          name: "Puka Nacua",
          position: "WR",
          stats: { receptions: 78, rec_yds: 975, tds: 6, targets: 102 },
          injured: false,
        },
      ],
    },
    awayTeam: {
      name: "San Francisco 49ers",
      shortName: "SF",
      logo: "🏈",
      form: ["W", "W", "W", "W", "L"],
      record: { wins: 12, losses: 5 },
      splits: {
        home: { wins: 8, losses: 1 },
        away: { wins: 4, losses: 4 },
      },
      players: [
        {
          name: "Brock Purdy",
          position: "QB",
          stats: { pass_yds: 4280, tds: 31, ints: 11, rating: 109.3 },
          injured: false,
        },
        {
          name: "Christian McCaffrey",
          position: "RB",
          stats: { rush_yds: 1459, rush_tds: 14, rec_yds: 564, receptions: 67 },
          injured: true,
          injuryNote: "Calf — doubtful",
        },
        {
          name: "Deebo Samuel",
          position: "WR",
          stats: { receptions: 55, rec_yds: 732, tds: 5, targets: 78 },
          injured: false,
        },
      ],
    },
    h2h: [
      { date: "2024-10-03", homeTeam: "San Francisco 49ers", awayTeam: "LA Rams", score: "27-24", winner: "San Francisco 49ers" },
      { date: "2024-01-13", homeTeam: "LA Rams", awayTeam: "San Francisco 49ers", score: "21-20", winner: "LA Rams" },
      { date: "2023-10-07", homeTeam: "San Francisco 49ers", awayTeam: "LA Rams", score: "30-23", winner: "San Francisco 49ers" },
      { date: "2023-01-08", homeTeam: "LA Rams", awayTeam: "San Francisco 49ers", score: "10-16", winner: "San Francisco 49ers" },
      { date: "2022-10-17", homeTeam: "San Francisco 49ers", awayTeam: "LA Rams", score: "24-9", winner: "San Francisco 49ers" },
    ],
    betRisk: {
      level: "High",
      score: 72,
      factors: [
        { label: "McCaffrey status", value: "Doubtful — season-best rusher absent", impact: "negative" },
        { label: "Cooper Kupp", value: "On IR — out for season", impact: "negative" },
        { label: "49ers form (last 5)", value: "W W W W L — strong", impact: "positive" },
        { label: "Rams home record", value: "6W 3L at SoFi", impact: "positive" },
        { label: "H2H last 5", value: "SF 4, Rams 1 — dominant", impact: "negative" },
        { label: "Weather", value: "Clear & ideal", impact: "positive" },
      ],
      summary:
        "49ers have dominated this rivalry but both sides missing critical offensive weapons (Kupp, McCaffrey). The uncertainty around McCaffrey's availability makes any line extremely volatile. Divisional rivalry games frequently defy form — high risk either way.",
    },
  },
  {
    id: "nfl-002",
    sport: "nfl",
    status: "finished",
    kickoff: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    venue: "Arrowhead Stadium",
    city: "Kansas City, MO",
    score: { home: 31, away: 17 },
    weather: { condition: "Clear", tempC: 8, windKph: 20, humidity: 52 },
    homeTeam: {
      name: "Kansas City Chiefs",
      shortName: "KC",
      logo: "🏹",
      form: ["W", "W", "W", "W", "W"],
      record: { wins: 14, losses: 3 },
      splits: {
        home: { wins: 9, losses: 0 },
        away: { wins: 5, losses: 3 },
      },
      players: [
        {
          name: "Patrick Mahomes",
          position: "QB",
          stats: { pass_yds: 4183, tds: 26, ints: 11, rating: 101.7 },
          injured: false,
        },
        {
          name: "Travis Kelce",
          position: "TE",
          stats: { receptions: 93, rec_yds: 984, tds: 5, targets: 121 },
          injured: false,
        },
      ],
    },
    awayTeam: {
      name: "Las Vegas Raiders",
      shortName: "LV",
      logo: "⚫",
      form: ["L", "L", "W", "L", "L"],
      record: { wins: 6, losses: 11 },
      splits: {
        home: { wins: 4, losses: 5 },
        away: { wins: 2, losses: 6 },
      },
      players: [
        {
          name: "Aidan O'Connell",
          position: "QB",
          stats: { pass_yds: 2218, tds: 12, ints: 10, rating: 76.4 },
          injured: false,
        },
        {
          name: "Davante Adams",
          position: "WR",
          stats: { receptions: 61, rec_yds: 721, tds: 4, targets: 88 },
          injured: true,
          injuryNote: "Hamstring — limited",
        },
      ],
    },
    h2h: [
      { date: "2024-11-04", homeTeam: "Las Vegas Raiders", awayTeam: "Kansas City Chiefs", score: "13-19", winner: "Kansas City Chiefs" },
      { date: "2024-10-10", homeTeam: "Kansas City Chiefs", awayTeam: "Las Vegas Raiders", score: "31-17", winner: "Kansas City Chiefs" },
      { date: "2023-11-09", homeTeam: "Las Vegas Raiders", awayTeam: "Kansas City Chiefs", score: "14-31", winner: "Kansas City Chiefs" },
      { date: "2023-08-20", homeTeam: "Kansas City Chiefs", awayTeam: "Las Vegas Raiders", score: "20-14", winner: "Kansas City Chiefs" },
      { date: "2022-10-13", homeTeam: "Las Vegas Raiders", awayTeam: "Kansas City Chiefs", score: "24-29", winner: "Kansas City Chiefs" },
    ],
    betRisk: {
      level: "Low",
      score: 18,
      factors: [
        { label: "KC form (last 5)", value: "W W W W W — perfect run", impact: "positive" },
        { label: "KC home record", value: "9W 0L at Arrowhead", impact: "positive" },
        { label: "Mahomes & Kelce", value: "Both healthy and dominant", impact: "positive" },
        { label: "Raiders form (last 5)", value: "L L W L L — struggling", impact: "negative" },
        { label: "H2H last 5", value: "Chiefs 5, Raiders 0", impact: "positive" },
        { label: "Adams limited", value: "Top WR restricted by injury", impact: "negative" },
      ],
      summary:
        "The most clear-cut matchup this week. Chiefs unbeaten at Arrowhead, perfect form, and own the H2H series 5-0. Raiders missing their best receiver. Risk of a KC win was minimal — 31-17 confirmed.",
    },
    boxScore: {
      statHeaders: ["Pass Yds", "Rush Yds", "TDs", "Turnovers", "Sacks", "Penalties"],
      home: [
        { player: "Patrick Mahomes", stats: { "Pass Yds": 285, "Rush Yds": 22, TDs: 3, Turnovers: 0, Sacks: 1, Penalties: 0 } },
        { player: "Isiah Pacheco", stats: { "Pass Yds": 0, "Rush Yds": 112, TDs: 1, Turnovers: 0, Sacks: 0, Penalties: 1 } },
      ],
      away: [
        { player: "Aidan O'Connell", stats: { "Pass Yds": 198, "Rush Yds": 8, TDs: 1, Turnovers: 2, Sacks: 3, Penalties: 2 } },
        { player: "Josh Jacobs", stats: { "Pass Yds": 0, "Rush Yds": 68, TDs: 1, Turnovers: 1, Sacks: 0, Penalties: 0 } },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// AFL — Australian Football League
// ---------------------------------------------------------------------------

const aflGames: Game[] = [
  {
    id: "afl-001",
    sport: "afl",
    status: "upcoming",
    kickoff: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
    venue: "MCG",
    city: "Melbourne, VIC",
    weather: { condition: "Partly Cloudy", tempC: 17, windKph: 25, humidity: 60 },
    homeTeam: {
      name: "Richmond Tigers",
      shortName: "RIC",
      logo: "🐯",
      form: ["W", "L", "W", "W", "L"],
      record: { wins: 8, losses: 6 },
      splits: {
        home: { wins: 6, losses: 1 },
        away: { wins: 2, losses: 5 },
      },
      players: [
        {
          name: "Tom Lynch",
          position: "FF",
          stats: { goals: 34, disposals_avg: 12.3, marks: 4.1, hit_outs: 0 },
          injured: false,
        },
        {
          name: "Dustin Martin",
          position: "MID",
          stats: { goals: 18, disposals_avg: 27.4, marks: 5.8, tackles: 4.2 },
          injured: true,
          injuryNote: "Ankle — managed",
        },
        {
          name: "Noah Balta",
          position: "DEF",
          stats: { goals: 6, disposals_avg: 18.1, marks: 4.9, rebound50: 3.2 },
          injured: false,
        },
      ],
    },
    awayTeam: {
      name: "Collingwood Magpies",
      shortName: "COL",
      logo: "🐦",
      form: ["W", "W", "W", "L", "W"],
      record: { wins: 11, losses: 3 },
      splits: {
        home: { wins: 7, losses: 1 },
        away: { wins: 4, losses: 2 },
      },
      players: [
        {
          name: "Nick Daicos",
          position: "MID",
          stats: { goals: 22, disposals_avg: 31.2, marks: 6.4, tackles: 3.1 },
          injured: false,
        },
        {
          name: "Darcy Moore",
          position: "DEF",
          stats: { goals: 8, disposals_avg: 15.6, marks: 7.2, rebound50: 2.8 },
          injured: false,
        },
        {
          name: "Jordan De Goey",
          position: "FWD/MID",
          stats: { goals: 28, disposals_avg: 22.4, marks: 4.8, tackles: 3.6 },
          injured: true,
          injuryNote: "Calf tightness — probable",
        },
      ],
    },
    h2h: [
      { date: "2024-08-10", homeTeam: "Collingwood Magpies", awayTeam: "Richmond Tigers", score: "98-82", winner: "Collingwood Magpies" },
      { date: "2024-04-06", homeTeam: "Richmond Tigers", awayTeam: "Collingwood Magpies", score: "112-89", winner: "Richmond Tigers" },
      { date: "2023-09-22", homeTeam: "Collingwood Magpies", awayTeam: "Richmond Tigers", score: "116-97", winner: "Collingwood Magpies" },
      { date: "2023-06-15", homeTeam: "Richmond Tigers", awayTeam: "Collingwood Magpies", score: "105-101", winner: "Richmond Tigers" },
      { date: "2022-09-03", homeTeam: "Collingwood Magpies", awayTeam: "Richmond Tigers", score: "87-79", winner: "Collingwood Magpies" },
    ],
    betRisk: {
      level: "Medium",
      score: 48,
      factors: [
        { label: "Collingwood form (last 5)", value: "W W W L W — dominant", impact: "positive" },
        { label: "Dustin Martin status", value: "Ankle — managed game time", impact: "negative" },
        { label: "Richmond MCG record", value: "6W 1L — fortress", impact: "positive" },
        { label: "H2H last 5", value: "Collingwood 3, Richmond 2", impact: "negative" },
        { label: "Wind at MCG", value: "25 kph — affects kicking accuracy", impact: "negative" },
        { label: "Nick Daicos form", value: "Brownlow favourite, elite form", impact: "negative" },
      ],
      summary:
        "Collingwood leads the ladder and has Brownlow favourite Nick Daicos in career-best form. Richmond's MCG fortress is a genuine factor, but Martin's managed workload reduces their midfield output. Competitive game expected — medium risk.",
    },
  },
  {
    id: "afl-002",
    sport: "afl",
    status: "live",
    kickoff: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    venue: "Optus Stadium",
    city: "Perth, WA",
    score: { home: 73, away: 61 },
    liveMinute: 90,
    weather: { condition: "Clear", tempC: 22, windKph: 14, humidity: 48 },
    homeTeam: {
      name: "West Coast Eagles",
      shortName: "WCE",
      logo: "🦅",
      form: ["L", "W", "L", "W", "W"],
      record: { wins: 7, losses: 7 },
      splits: {
        home: { wins: 6, losses: 1 },
        away: { wins: 1, losses: 6 },
      },
      players: [
        {
          name: "Oscar Allen",
          position: "FF",
          stats: { goals: 41, disposals_avg: 14.2, marks: 5.1, hit_outs: 0 },
          injured: false,
        },
        {
          name: "Tim Kelly",
          position: "MID",
          stats: { goals: 12, disposals_avg: 26.8, marks: 4.3, tackles: 3.9 },
          injured: false,
        },
      ],
    },
    awayTeam: {
      name: "Hawthorn Hawks",
      shortName: "HAW",
      logo: "🟤",
      form: ["L", "L", "W", "L", "W"],
      record: { wins: 6, losses: 8 },
      splits: {
        home: { wins: 4, losses: 3 },
        away: { wins: 2, losses: 5 },
      },
      players: [
        {
          name: "James Sicily",
          position: "DEF",
          stats: { goals: 9, disposals_avg: 21.3, marks: 7.8, rebound50: 3.4 },
          injured: false,
        },
        {
          name: "Mitch Lewis",
          position: "FF",
          stats: { goals: 36, disposals_avg: 13.1, marks: 5.9, hit_outs: 0 },
          injured: true,
          injuryNote: "Hamstring — out",
        },
      ],
    },
    h2h: [
      { date: "2024-07-28", homeTeam: "Hawthorn Hawks", awayTeam: "West Coast Eagles", score: "92-74", winner: "Hawthorn Hawks" },
      { date: "2024-05-19", homeTeam: "West Coast Eagles", awayTeam: "Hawthorn Hawks", score: "108-84", winner: "West Coast Eagles" },
      { date: "2023-08-05", homeTeam: "Hawthorn Hawks", awayTeam: "West Coast Eagles", score: "88-103", winner: "West Coast Eagles" },
      { date: "2023-04-29", homeTeam: "West Coast Eagles", awayTeam: "Hawthorn Hawks", score: "92-78", winner: "West Coast Eagles" },
      { date: "2022-07-09", homeTeam: "Hawthorn Hawks", awayTeam: "West Coast Eagles", score: "76-98", winner: "West Coast Eagles" },
    ],
    betRisk: {
      level: "Low",
      score: 30,
      factors: [
        { label: "West Coast home record", value: "6W 1L at Optus Stadium", impact: "positive" },
        { label: "Hawthorn away record", value: "2W 5L away — poor", impact: "negative" },
        { label: "Mitch Lewis out", value: "Top scorer absent", impact: "negative" },
        { label: "H2H last 5", value: "West Coast 4, Hawthorn 1", impact: "positive" },
        { label: "Weather", value: "Clear and calm in Perth", impact: "positive" },
      ],
      summary:
        "West Coast's Optus Stadium fortress against Hawthorn who struggle on the road and are missing their key forward. H2H firmly in Eagles' favour. Low risk backing the home side — currently tracking 73-61 in the third quarter.",
    },
  },
];

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const ALL_GAMES: Game[] = [
  ...soccerGames,
  ...basketballGames,
  ...nflGames,
  ...aflGames,
];

export function getGameById(id: string): Game | undefined {
  return ALL_GAMES.find((g) => g.id === id);
}

export function getGamesBySport(sport: string): Game[] {
  return ALL_GAMES.filter((g) => g.sport === sport);
}
