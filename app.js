// @ts-nocheck
const { createClient } = supabase;

const supabaseUrl = "https://hcpgiocsgsqwpkpyxmcj.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjcGdpb2NzZ3Nxd3BrcHl4bWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5Mzg0NzUsImV4cCI6MjA4MTUxNDQ3NX0.fD3dDeL7MmI-0Hs8MShIVl-Euy9MLBQunwTUXrOwMZw";

const client = createClient(supabaseUrl, supabaseKey);

// Inscription
document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  const { data, error } = await client.auth.signUp({ email, password });

  if (error) {
    document.getElementById("status").innerText =
      "Erreur inscription: " + error.message;
  } else {
    document.getElementById("status").innerText =
      "Compte créé, regarde dans Supabase → Users.";
    console.log(data);
  }
});

// Connexion
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    document.getElementById("status").innerText =
      "Erreur connexion: " + error.message;
  } else {
    document.getElementById("status").innerText =
      "Connecté en tant que " + email;
    console.log(data);
  }
});

let currentUser = null;

async function loadCurrentTeam() {
  if (!currentUser) {
    currentTeam = null;
    return;
  }
  const { data, error } = await client
    .from("teams")
    .select("*")
    .eq("owner_id", currentUser.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Erreur load team", error);
    currentTeam = null;
  } else {
    currentTeam = data;
    console.log("Current team:", currentTeam);
  }
}

client.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;
  loadCurrentTeam().then(() => {
    loadMyMatches();
    loadOpenScrims();
    loadLeaderboard();
  });
});

// Création d'équipe
document.getElementById("team-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) {
    document.getElementById("team-status").innerText =
      "Tu dois être connecté pour créer une équipe.";
    return;
  }

  const name = document.getElementById("team-name").value;

  const { data, error } = await client
    .from("teams")
    .insert([{ name, owner_id: currentUser.id }])
    .select();

  if (error) {
    document.getElementById("team-status").innerText =
      "Erreur création équipe: " + error.message;
  } else {
    document.getElementById("team-status").innerText =
      "Équipe créée: " + data[0].name;
    console.log("Team:", data[0]);
  }
});

document.getElementById("scrim-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUser) {
    document.getElementById("scrim-status").innerText =
      "Tu dois être connecté.";
    return;
  }
  if (!currentTeam) {
    document.getElementById("scrim-status").innerText =
      "Tu dois avoir une équipe pour créer un scrim.";
    return;
  }

  const scheduled_at = document.getElementById("scrim-time").value;
  const mode = document.getElementById("scrim-mode").value;

  const { data, error } = await client
    .from("scrims")
    .insert([
      {
        team_a_id: currentTeam.id,
        scheduled_at,
        mode,
        status: "open",
      },
    ])
    .select();

  if (error) {
    document.getElementById("scrim-status").innerText =
      "Erreur création scrim: " + error.message;
  } else {
    document.getElementById("scrim-status").innerText = "Scrim créé.";
    loadOpenScrims();
  }
});

async function loadOpenScrims() {
  const { data, error } = await client
    .from("scrims")
    .select("*")
    .eq("status", "open")
    .order("scheduled_at", { ascending: true });

  const list = document.getElementById("scrim-list");
  list.innerHTML = "";

  if (error) {
    list.innerText = "Erreur chargement scrims: " + error.message;
    return;
  }

  data.forEach((scrim) => {
    const li = document.createElement("li");
    li.textContent = `${scrim.mode} - ${scrim.scheduled_at}`;

    const btn = document.createElement("button");
    btn.textContent = "Accepter";
    btn.onclick = () => acceptScrim(scrim.id);

    li.appendChild(document.createTextNode(" "));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

async function acceptScrim(id) {
  if (!currentUser || !currentTeam) {
    alert("Tu dois être connecté avec une équipe pour accepter un scrim.");
    return;
  }

  const { error } = await client
    .from("scrims")
    .update({
      team_b_id: currentTeam.id,
      status: "accepted",
    })
    .eq("id", id)
    .eq("status", "open"); // évite d’accepter un scrim déjà pris

  if (error) {
    alert("Erreur acceptation scrim: " + error.message);
  } else {
    loadOpenScrims();
  }
}

async function loadMyMatches() {
  const list = document.getElementById("my-matches");
  list.innerHTML = "";

  if (!currentTeam) {
    list.innerText = "Pas encore d'équipe.";
    return;
  }

  const { data, error } = await client
    .from("scrims")
    .select("*")
    .or(`team_a_id.eq.${currentTeam.id},team_b_id.eq.${currentTeam.id}`)
    .order("scheduled_at", { ascending: true });

  if (error) {
    list.innerText = "Erreur chargement matchs: " + error.message;
    return;
  }

  if (!data || !data.length) {
    list.innerText = "Aucun match pour l'instant.";
    return;
  }

  data.forEach((scrim) => {
    const li = document.createElement("li");
    const isTeamA = scrim.team_a_id === currentTeam.id;
    const vs = isTeamA ? "Adversaire (team B)" : "Adversaire (team A)";

    let text = `${scrim.mode} - ${scrim.scheduled_at} - statut: ${scrim.status} - ${vs}`;

    if (scrim.status === "finished") {
      text += ` | Score: ${scrim.score_team_a} - ${scrim.score_team_b}`;
      li.textContent = text;
      list.appendChild(li);
      return;
    }

    li.textContent = text;

    if (scrim.status === "accepted") {
      const inputA = document.createElement("input");
      inputA.type = "number";
      inputA.min = 0;
      inputA.placeholder = "Score A";

      const inputB = document.createElement("input");
      inputB.type = "number";
      inputB.min = 0;
      inputB.placeholder = "Score B";

      const btn = document.createElement("button");
      btn.textContent = "Reporter le score";
      btn.onclick = async () => {
        const sA = parseInt(inputA.value, 10);
        const sB = parseInt(inputB.value, 10);
        if (Number.isNaN(sA) || Number.isNaN(sB)) {
          alert("Entre les deux scores.");
          return;
        }

        // 1. Mettre le scrim en finished avec les scores
        const { error: scrimError } = await client
          .from("scrims")
          .update({
            score_team_a: sA,
            score_team_b: sB,
            status: "finished",
          })
          .eq("id", scrim.id);

        if (scrimError) {
          alert("Erreur report score: " + scrimError.message);
          return;
        }

        // 2. Calculer les points (V1 simple : 3 pts win, 1 nul, 0 défaite)
        let pointsA = 0;
        let pointsB = 0;
        if (sA > sB) {
          pointsA = 3;
        } else if (sB > sA) {
          pointsB = 3;
        } else {
          pointsA = 1;
          pointsB = 1;
        }

        // 3. Appliquer les points aux deux teams
        const updates = [];

        if (pointsA > 0) {
          updates.push(
            client.rpc("increment_team_points", {
              team_id_input: scrim.team_a_id,
              points_input: pointsA,
            })
          );
        }

        if (pointsB > 0) {
          updates.push(
            client.rpc("increment_team_points", {
              team_id_input: scrim.team_b_id,
              points_input: pointsB,
            })
          );
        }

        await Promise.all(updates);

        loadMyMatches();
        loadLeaderboard();
      };

      li.appendChild(document.createTextNode(" "));
      li.appendChild(inputA);
      li.appendChild(inputB);
      li.appendChild(btn);
    }

    list.appendChild(li);
  });
}

async function loadLeaderboard() {
  const list = document.getElementById("leaderboard");
  if (!list) return;

  const { data, error } = await client
    .from("teams")
    .select("name, points")
    .order("points", { ascending: false });

  list.innerHTML = "";

  if (error) {
    list.innerText = "Erreur classement: " + error.message;
    return;
  }

  data.forEach((team) => {
    const li = document.createElement("li");
    li.textContent = `${team.name} - ${team.points} pts`;
    list.appendChild(li);
  });
}
