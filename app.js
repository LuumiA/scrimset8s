// @ts-nocheck
const { createClient } = supabase;

const supabaseUrl = "https://hcpgiocsgsqwpkpyxmcj.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjcGdpb2NzZ3Nxd3BrcHl4bWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5Mzg0NzUsImV4cCI6MjA4MTUxNDQ3NX0.fD3dDeL7MmI-0Hs8MShIVl-Euy9MLBQunwTUXrOwMZw";

const client = createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let currentTeam = null;
const LOCAL_AUTH_KEY = "bo7_is_logged_in";

// ---------- UI AUTH (email topbar + popup) ----------

function updateUserEmail() {
  const span = document.getElementById("user-email");
  const btn = document.getElementById("open-auth");

  if (currentUser) {
    const label = currentUser.username || currentUser.email;
    if (span) span.textContent = label;
    if (btn) btn.textContent = "Déconnexion";
  } else {
    if (span) span.textContent = "";
    if (btn) btn.textContent = "Login / Inscription";
  }
}

function openAuth() {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.classList.add("visible");
}

function closeAuth() {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.classList.remove("visible");
}

// ---------- AUTH (signup / login) ----------

async function handleSignUp(e) {
  e.preventDefault();
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  const { data, error } = await client.auth.signUp({ email, password });

  const status = document.getElementById("status");
  if (error) {
    status.innerText = "Erreur inscription: " + error.message;
  } else {
    status.innerText = "Compte créé, vérifie tes mails.";
    closeAuth();
    console.log(data);
  }
}

async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  const status = document.getElementById("status");
  if (error) {
    status.innerText = "Erreur connexion: " + error.message;
  } else {
    status.innerText = "Connecté en tant que " + email;

    // On considère maintenant l'utilisateur comme connecté côté front
    currentUser = data.user;
    localStorage.setItem(LOCAL_AUTH_KEY, "1");

    await loadMyProfile();
    updateUserEmail();
    closeAuth();

    await loadCurrentTeam();
    await loadMyMatches();
    await loadOpenScrims();
    await loadLeaderboard();
  }
}

// ---------- DONNÉES : team / scrims / matchs / classement ----------

async function loadCurrentTeam() {
  if (!currentUser) {
    currentTeam = null;
    const createSection = document.getElementById("team-create-section");
    const infoSection = document.getElementById("team-info-section");
    if (createSection && infoSection) {
      createSection.style.display = "block";
      infoSection.style.display = "none";
    }
    return;
  }

  // Cherche la team via team_members
  const { data: memberRow, error: memberError } = await client
    .from("team_members")
    .select("team_id")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (memberError || !memberRow) {
    currentTeam = null;
    const createSection = document.getElementById("team-create-section");
    const infoSection = document.getElementById("team-info-section");
    if (createSection && infoSection) {
      createSection.style.display = "block";
      infoSection.style.display = "none";
    }
    return;
  }

  const { data, error } = await client
    .from("teams")
    .select("*")
    .eq("id", memberRow.team_id)
    .maybeSingle();

  if (error) {
    console.error("Erreur load team", error);
    currentTeam = null;
  } else {
    currentTeam = data;

    const createSection = document.getElementById("team-create-section");
    const infoSection = document.getElementById("team-info-section");
    const nameDisplay = document.getElementById("team-name-display");

    if (currentTeam && infoSection && createSection) {
      createSection.style.display = "none";
      infoSection.style.display = "block";
      if (nameDisplay) {
        nameDisplay.textContent = `Nom : ${currentTeam.name}`;
      }
      loadTeamMembers();
    } else if (createSection && infoSection) {
      createSection.style.display = "block";
      infoSection.style.display = "none";
    }

    console.log("Current team:", currentTeam);
  }
}

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
    .insert([{ name }])
    .select();

  if (error || !data || !data[0]) {
    document.getElementById("team-status").innerText =
      "Erreur création équipe: " + (error?.message || "");
  } else {
    const team = data[0];

    // Ajoute le créateur comme owner dans team_members
    await client.from("team_members").insert([
      {
        team_id: team.id,
        user_id: currentUser.id,
        role: "owner",
      },
    ]);

    document.getElementById("team-status").innerText =
      "Équipe créée: " + team.name;
    console.log("Team:", team);
    await loadCurrentTeam();
    await loadLeaderboard();
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

    // Reset des champs du formulaire
    document.getElementById("scrim-time").value = "";
    document.getElementById("scrim-mode").value = "";
  }
});

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

async function loadOpenScrims() {
  const { data, error } = await client
    .from("scrims")
    .select("id, mode, scheduled_at, status, team_a_id")
    .eq("status", "open")
    .order("scheduled_at", { ascending: true });

  const list = document.getElementById("scrim-list");
  list.innerHTML = "";

  if (error) {
    list.innerText = "Erreur chargement scrims: " + error.message;
    return;
  }

  if (!data || !data.length) {
    list.innerText = "Aucun scrim ouvert pour le moment.";
    return;
  }

  // Récupérer les noms d’équipes pour toutes les team_a_id
  const teamIds = [...new Set(data.map((s) => s.team_a_id).filter(Boolean))];

  let teamsById = {};
  if (teamIds.length) {
    const { data: teams } = await client
      .from("teams")
      .select("id, name")
      .in("id", teamIds);

    if (teams) {
      teamsById = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    }
  }

  data.forEach((scrim) => {
    const li = document.createElement("li");
    li.className = "scrim-card scrim-card-hover";

    const header = document.createElement("div");
    header.className = "scrim-card-header";
    header.textContent = scrim.mode;

    const teamLine = document.createElement("div");
    teamLine.className = "scrim-card-team";
    const teamName = teamsById[scrim.team_a_id] || "Équipe inconnue";
    teamLine.textContent = `Équipe : ${teamName}`;

    const meta = document.createElement("div");
    meta.className = "scrim-card-meta";
    meta.textContent = `${scrim.scheduled_at} • ${scrim.status}`;

    const footer = document.createElement("div");
    footer.className = "scrim-card-footer";

    const btn = document.createElement("button");

    if (currentTeam && scrim.team_a_id === currentTeam.id) {
      btn.textContent = "Scrim créé par ta team";
      btn.disabled = true;
      btn.classList.add("button-disabled"); // optionnel pour le style
    } else {
      btn.textContent = "Accepter le scrim";
      btn.onclick = () => acceptScrim(scrim.id);
    }

    footer.appendChild(btn);

    li.appendChild(header);
    li.appendChild(teamLine);
    li.appendChild(meta);
    li.appendChild(footer);
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
    .eq("status", "open");

  if (error) {
    alert("Erreur acceptation scrim: " + error.message);
  } else {
    loadOpenScrims();
    loadMyMatches();
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

  // Récupérer tous les ids d'équipes (A et B) présents dans ces scrims
  const teamIds = [
    ...new Set(data.flatMap((s) => [s.team_a_id, s.team_b_id]).filter(Boolean)),
  ];

  let teamsById = {};
  if (teamIds.length) {
    const { data: teams } = await client
      .from("teams")
      .select("id, name")
      .in("id", teamIds);

    if (teams) {
      teamsById = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    }
  }

  data.forEach((scrim) => {
    const li = document.createElement("li");

    const isTeamA = scrim.team_a_id === currentTeam.id;
    const opponentId = isTeamA ? scrim.team_b_id : scrim.team_a_id;
    const opponentName = teamsById[opponentId] || "Adversaire inconnu";

    let text = `${scrim.mode} - ${scrim.scheduled_at} - statut: ${scrim.status} - Adversaire : ${opponentName}`;

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

async function loadRecentScrims() {
  const list = document.getElementById("recent-scrims");
  if (!list) return;

  const { data, error } = await client
    .from("scrims")
    .select("id, mode, scheduled_at, status")
    .order("scheduled_at", { ascending: false })
    .limit(5);

  list.innerHTML = "";

  if (error) {
    list.innerText = "Erreur chargement scrims: " + error.message;
    return;
  }

  if (!data || !data.length) {
    list.innerText = "Aucun scrim pour l'instant.";
    return;
  }

  data.forEach((scrim) => {
    const li = document.createElement("li");
    li.className = "scrim-card scrim-card-hover";

    const header = document.createElement("div");
    header.className = "scrim-card-header";
    header.textContent = scrim.mode;

    const meta = document.createElement("div");
    meta.className = "scrim-card-meta";
    meta.textContent = `${scrim.scheduled_at} • ${scrim.status}`;

    // Option cool : clic sur la card → onglet Scrims
    li.addEventListener("click", () => {
      const scrimsBtn = document.querySelector(
        '.nav-link[data-section="scrims-section"]'
      );
      if (scrimsBtn) scrimsBtn.click();
    });

    li.appendChild(header);
    li.appendChild(meta);
    list.appendChild(li);
  });
}

// ---------- NAVIGATION ENTRE SECTIONS ----------

document.querySelectorAll(".nav-link[data-section]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-section");

    document
      .querySelectorAll(".nav-link[data-section]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    document
      .querySelectorAll(".panel")
      .forEach((sec) => sec.classList.remove("visible"));
    document.getElementById(target).classList.add("visible");
  });
});

async function loadLeaderboardHome() {
  const list = document.getElementById("leaderboard-home");
  if (!list) return;

  const { data, error } = await client
    .from("teams")
    .select("name, points")
    .order("points", { ascending: false })
    .limit(10);

  list.innerHTML = "";

  if (error) {
    list.innerText = "Erreur classement: " + error.message;
    return;
  }

  if (!data || !data.length) {
    list.innerText = "Aucune équipe pour l'instant.";
    return;
  }

  data.forEach((team) => {
    const li = document.createElement("li");
    li.textContent = `${team.name} - ${team.points} pts`;
    list.appendChild(li);
  });
}

// ---------- BOUTON LOGIN / DÉCONNEXION + CROIX + FORM ----------

document.addEventListener("DOMContentLoaded", async () => {
  const openAuthBtn = document.getElementById("open-auth");
  const closeAuthBtn = document.getElementById("close-auth");
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");
  const renameBtn = document.getElementById("rename-team-btn");
  const deleteBtn = document.getElementById("delete-team-btn");
  const inviteBtn = document.getElementById("invite-btn");
  const profileForm = document.getElementById("profile-form");

  const hadLocalSession = localStorage.getItem(LOCAL_AUTH_KEY) === "1";
  if (!hadLocalSession) {
    // Aucun flag local → on démarre déconnecté
    currentUser = null;
    currentTeam = null;
    updateUserEmail();
  } else {
    // Il y avait une session front → on redemande la vraie session à Supabase
    const {
      data: { session },
    } = await client.auth.getSession();

    currentUser = session?.user || null;

    if (!currentUser) {
      // Plus de session Supabase → on nettoie le flag local
      localStorage.removeItem(LOCAL_AUTH_KEY);
      updateUserEmail(); // remet "Login / Inscription"
    } else {
      // 1) on charge le profil pour récupérer username
      await loadMyProfile(); // ça fait currentUser.username = ...

      // 2) ensuite on met à jour le texte en haut à droite
      updateUserEmail();

      // 3) puis le reste
      await loadCurrentTeam();
      await loadMyMatches();
      await loadOpenScrims();
      await loadLeaderboard();
    }
  }

  if (openAuthBtn) {
    openAuthBtn.addEventListener("click", async () => {
      if (!currentUser) {
        openAuth();
      } else {
        // Déconnexion front-only
        currentUser = null;
        currentTeam = null;
        localStorage.removeItem(LOCAL_AUTH_KEY);

        await loadMyProfile();

        updateUserEmail();

        await loadCurrentTeam();
        await loadMyMatches();
        await loadOpenScrims();
        await loadLeaderboard();
      }
    });
  }

  if (closeAuthBtn) {
    closeAuthBtn.addEventListener("click", () => {
      closeAuth();
    });
  }

  if (signupForm) signupForm.addEventListener("submit", handleSignUp);
  if (loginForm) loginForm.addEventListener("submit", handleSignIn);

  if (renameBtn) {
    renameBtn.addEventListener("click", async () => {
      if (!currentTeam) return;
      const newName = prompt("Nouveau nom de l'équipe :", currentTeam.name);
      if (!newName) return;
      const { data, error } = await client
        .from("teams")
        .update({ name: newName })
        .eq("id", currentTeam.id)
        .select();
      if (error) {
        alert("Erreur renommage: " + error.message);
      } else {
        currentTeam = data[0];
        loadCurrentTeam();
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!currentTeam || !currentUser) return;

      // Vérifie que tu es owner
      const { data: meRow } = await client
        .from("team_members")
        .select("role")
        .eq("team_id", currentTeam.id)
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (!meRow || meRow.role !== "owner") {
        alert("Seul le owner peut supprimer l'équipe.");
        return;
      }

      if (!confirm("Supprimer définitivement l'équipe ?")) return;

      const { error } = await client
        .from("teams")
        .delete()
        .eq("id", currentTeam.id);

      if (error) {
        alert("Erreur suppression: " + error.message);
      } else {
        currentTeam = null;
        loadCurrentTeam();
        loadLeaderboard();
      }
    });
  }

  if (inviteBtn) {
    inviteBtn.addEventListener("click", inviteMemberByUsername);
  }

  if (profileForm) {
    profileForm.addEventListener("submit", saveMyProfile);
  }

  // Charger données d'accueil
  loadLeaderboardHome();
  loadRecentScrims();
});

// ---------- MEMBRES D'ÉQUIPE ----------

async function loadTeamMembers() {
  const list = document.getElementById("team-members");
  if (!list) return;
  list.innerHTML = "";

  if (!currentTeam) {
    list.innerHTML = "<li>Aucune équipe.</li>";
    return;
  }

  // 1) On récupère d'abord le rôle du joueur connecté dans cette team
  const { data: meRow } = await client
    .from("team_members")
    .select("role")
    .eq("team_id", currentTeam.id)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  const isCurrentUserOwner = meRow?.role === "owner";

  // 2) On charge tous les membres avec leur email depuis profiles
  const { data, error } = await client
    .from("team_members")
    .select(
      `
    id,
    role,
    user_id,
    profiles:user_id ( email, username )
  `
    )
    .eq("team_id", currentTeam.id);

  if (error) {
    console.error("loadTeamMembers error", error);
    list.innerHTML = "<li>Erreur chargement membres.</li>";
    return;
  }

  if (!data || !data.length) {
    list.innerHTML = "<li>Pas encore de joueurs dans l'équipe.</li>";
    return;
  }

  data.forEach((m) => {
    const li = document.createElement("li");
    const label = m.profiles?.username || m.profiles?.email || "(inconnu)";
    const roleLabel = m.role === "owner" ? " (owner)" : "";
    li.textContent = `${label}${roleLabel}`;

    // 3) Bouton "Retirer" uniquement si :
    //    - le joueur connecté est owner
    //    - ce n'est pas lui-même
    //    - la cible n'est pas un owner
    if (
      isCurrentUserOwner &&
      currentUser &&
      m.user_id !== currentUser.id &&
      m.role !== "owner"
    ) {
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Retirer";
      removeBtn.onclick = async () => {
        const { error: delError } = await client
          .from("team_members")
          .delete()
          .eq("id", m.id);

        if (delError) {
          alert("Erreur retrait joueur.");
          console.error(delError);
          return;
        }
        loadTeamMembers();
      };
      li.appendChild(document.createTextNode(" "));
      li.appendChild(removeBtn);
    }

    list.appendChild(li);
  });
}

async function inviteMemberByUsername() {
  const emailInput = document.getElementById("invite-email");
  const status = document.getElementById("invite-status");
  if (!emailInput || !status) return;

  const email = emailInput.value.trim();
  if (!email) {
    status.textContent = "Entre un email.";
    return;
  }
  if (!currentTeam || !currentUser) {
    status.textContent = "Tu dois avoir une équipe.";
    return;
  }

  // Vérifie que tu es owner
  const { data: meRow } = await client
    .from("team_members")
    .select("role")
    .eq("team_id", currentTeam.id)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (!meRow || meRow.role !== "owner") {
    status.textContent = "Seul le owner peut ajouter des joueurs.";
    return;
  }

  // Vérifie la limite de 4
  const { count: memberCount } = await client
    .from("team_members")
    .select("*", { count: "exact", head: true })
    .eq("team_id", currentTeam.id);

  if (memberCount >= 4) {
    status.textContent = "Équipe déjà pleine (4 joueurs max).";
    return;
  }

  // Trouve l'utilisateur par email dans profiles
  const { data: userRow, error: userError } = await client
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (userError || !userRow) {
    status.textContent = "Aucun compte avec cet email.";
    return;
  }

  // Vérifie qu'il n'a pas déjà une team
  const { data: existingMember } = await client
    .from("team_members")
    .select("id")
    .eq("user_id", userRow.id)
    .maybeSingle();

  if (existingMember) {
    status.textContent = "Ce joueur est déjà dans une équipe.";
    return;
  }

  const { error: insertError } = await client.from("team_members").insert([
    {
      team_id: currentTeam.id,
      user_id: userRow.id,
      role: "member",
    },
  ]);

  if (insertError) {
    status.textContent = "Erreur ajout joueur.";
    console.error(insertError);
    return;
  }

  status.textContent = "Joueur ajouté à l'équipe.";
  emailInput.value = "";
  loadTeamMembers();
}

// ---------- PROFIL JOUEUR ----------

async function loadMyProfile() {
  if (!currentUser) return;

  const { data, error } = await client
    .from("profiles")
    .select("username, discord, activision_id")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error || !data) return;

  const usernameInput = document.getElementById("profile-username");
  const discordInput = document.getElementById("profile-discord");
  const activisionInput = document.getElementById("profile-activision");

  if (usernameInput) usernameInput.value = data.username || "";
  if (discordInput) discordInput.value = data.discord || "";
  if (activisionInput) activisionInput.value = data.activision_id || "";

  currentUser.username = data.username || null;
}

async function saveMyProfile(e) {
  e.preventDefault();
  if (!currentUser) return;

  const username = document.getElementById("profile-username").value.trim();
  const discord = document.getElementById("profile-discord").value.trim();
  const activision = document.getElementById("profile-activision").value.trim();

  const status = document.getElementById("profile-status");

  const { error } = await client
    .from("profiles")
    .update({
      username,
      discord,
      activision_id: activision,
    })
    .eq("id", currentUser.id);

  if (error) {
    status.textContent = "Erreur sauvegarde profil : " + error.message;
  } else {
    status.textContent = "Profil mis à jour.";

    currentUser.username = username || null;
    updateUserEmail();
  }
}
