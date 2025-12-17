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
  if (!currentTeam) {
    document.getElementById("my-matches").innerText = "Pas encore d'équipe.";
    return;
  }

  const { data, error } = await client
    .from("scrims")
    .select("*")
    .or(`team_a_id.eq.${currentTeam.id},team_b_id.eq.${currentTeam.id}`)
    .order("scheduled_at", { ascending: true });

  const list = document.getElementById("my-matches");
  list.innerHTML = "";

  if (error) {
    list.innerText = "Erreur chargement matchs: " + error.message;
    return;
  }

  if (!data.length) {
    list.innerText = "Aucun match pour l'instant.";
    return;
  }

  data.forEach((scrim) => {
    const li = document.createElement("li");
    const vs =
      scrim.team_a_id === currentTeam.id
        ? "Adversaire (team B)"
        : "Adversaire (team A)";
    li.textContent = `${scrim.mode} - ${scrim.scheduled_at} - statut: ${scrim.status} - ${vs}`;
    list.appendChild(li);
  });
}
