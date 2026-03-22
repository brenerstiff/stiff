const STORAGE_KEY = "consultoria_hub_v1";

const state = {
  students: [],
  notices: [],
  editingStudentId: null,
};

const refs = {
  stats: document.querySelector("#stats"),
  studentForm: document.querySelector("#studentForm"),
  studentList: document.querySelector("#studentList"),
  studentTemplate: document.querySelector("#studentTemplate"),
  studentSearch: document.querySelector("#studentSearch"),
  statusFilter: document.querySelector("#statusFilter"),
  noticeForm: document.querySelector("#noticeForm"),
  noticeList: document.querySelector("#noticeList"),
  noticeTemplate: document.querySelector("#noticeTemplate"),
  seedDataBtn: document.querySelector("#seedDataBtn"),
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ students: state.students, notices: state.notices }));
}

function load() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const data = JSON.parse(saved);
    state.students = Array.isArray(data.students) ? data.students : [];
    state.notices = Array.isArray(data.notices) ? data.notices : [];
  } catch {
    state.students = [];
    state.notices = [];
  }
}

function setStudentForm(student = null) {
  const f = refs.studentForm;
  f.nome.value = student?.nome || "";
  f.email.value = student?.email || "";
  f.telefone.value = student?.telefone || "";
  f.curso.value = student?.curso || "";
  f.status.value = student?.status || "ativo";
  f.progresso.value = student?.progresso ?? "";
  f.tags.value = (student?.tags || []).join(", ");
  f.observacoes.value = student?.observacoes || "";
}

function upsertStudent(payload) {
  if (state.editingStudentId) {
    state.students = state.students.map((s) =>
      s.id === state.editingStudentId
        ? { ...s, ...payload }
        : s
    );
  } else {
    state.students.unshift({
      id: uid(),
      criadoEm: today(),
      ultimoContato: today(),
      ...payload,
    });
  }

  state.editingStudentId = null;
  refs.studentForm.querySelector("button[type='submit']").textContent = "Salvar aluno";
  setStudentForm();
  persist();
  renderAll();
}

function removeStudent(id) {
  state.students = state.students.filter((s) => s.id !== id);
  persist();
  renderAll();
}

function touchStudent(id) {
  state.students = state.students.map((s) =>
    s.id === id ? { ...s, ultimoContato: today() } : s
  );
  persist();
  renderAll();
}

function addNotice(payload) {
  state.notices.unshift({
    id: uid(),
    criadoEm: today(),
    ...payload,
  });
  persist();
  refs.noticeForm.reset();
  renderAll();
}

function removeNotice(id) {
  state.notices = state.notices.filter((n) => n.id !== id);
  persist();
  renderAll();
}

function getFilteredStudents() {
  const term = refs.studentSearch.value.trim().toLowerCase();
  const status = refs.statusFilter.value;

  return state.students.filter((s) => {
    const haystack = `${s.nome} ${s.email} ${s.curso} ${(s.tags || []).join(" ")}`.toLowerCase();
    const matchTerm = !term || haystack.includes(term);
    const matchStatus = status === "all" || s.status === status;
    return matchTerm && matchStatus;
  });
}

function renderStats() {
  const students = state.students;
  const notices = state.notices;

  const byStatus = (wanted) => students.filter((s) => s.status === wanted).length;
  const avgProgress = students.length
    ? Math.round(students.reduce((acc, cur) => acc + Number(cur.progresso || 0), 0) / students.length)
    : 0;

  const blocks = [
    ["Total de alunos", students.length],
    ["Ativos", byStatus("ativo")],
    ["Em atenção", byStatus("atenção")],
    ["Concluídos", byStatus("concluído")],
    ["Progresso médio", `${avgProgress}%`],
    ["Recados no mural", notices.length],
  ];

  refs.stats.innerHTML = "";
  blocks.forEach(([label, value]) => {
    const node = document.createElement("article");
    node.className = "stat";
    node.innerHTML = `<small>${label}</small><strong>${value}</strong>`;
    refs.stats.appendChild(node);
  });
}

function renderStudents() {
  refs.studentList.innerHTML = "";
  const students = getFilteredStudents();

  if (!students.length) {
    refs.studentList.innerHTML = '<p>Nenhum aluno encontrado com esse filtro.</p>';
    return;
  }

  students.forEach((s) => {
    const node = refs.studentTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('[data-field="nome"]').textContent = s.nome;
    node.querySelector('[data-field="email"]').textContent = s.email;

    const status = node.querySelector('[data-field="status"]');
    status.textContent = s.status;
    status.classList.add(`status-${s.status}`);

    node.querySelector('[data-field="curso"]').textContent = s.curso;
    node.querySelector('[data-field="telefone"]').textContent = s.telefone;
    node.querySelector('[data-field="ultimoContato"]').textContent = formatDate(s.ultimoContato);
    node.querySelector('[data-field="progresso"]').textContent = Number(s.progresso || 0);
    node.querySelector('[data-field="progressBar"]').style.width = `${Math.max(0, Math.min(100, Number(s.progresso || 0)))}%`;
    node.querySelector('[data-field="tags"]').textContent = (s.tags || []).join(", ") || "—";
    node.querySelector('[data-field="observacoes"]').textContent = s.observacoes || "Sem observações";

    node.querySelector('[data-action="delete"]').addEventListener("click", () => removeStudent(s.id));
    node.querySelector('[data-action="touch"]').addEventListener("click", () => touchStudent(s.id));
    node.querySelector('[data-action="edit"]').addEventListener("click", () => {
      state.editingStudentId = s.id;
      setStudentForm(s);
      refs.studentForm.querySelector("button[type='submit']").textContent = "Atualizar aluno";
      refs.studentForm.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    refs.studentList.appendChild(node);
  });
}

function renderNotices() {
  refs.noticeList.innerHTML = "";

  const notices = [...state.notices].sort((a, b) => {
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1;
    return String(b.criadoEm).localeCompare(String(a.criadoEm));
  });

  if (!notices.length) {
    refs.noticeList.innerHTML = '<p>Nenhum recado publicado.</p>';
    return;
  }

  notices.forEach((n) => {
    const node = refs.noticeTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('[data-field="titulo"]').textContent = n.titulo;
    node.querySelector('[data-field="mensagem"]').textContent = n.mensagem;
    node.querySelector('[data-field="publico"]').textContent = n.publico;
    node.querySelector('[data-field="criadoEm"]').textContent = formatDate(n.criadoEm);
    node.querySelector('[data-field="expiraEm"]').textContent = n.expiraEm ? formatDate(n.expiraEm) : "Sem expiração";

    const priority = node.querySelector('[data-field="prioridade"]');
    priority.textContent = n.prioridade;
    priority.classList.add(`prioridade-${n.prioridade}`);

    node.querySelector('[data-field="fixado"]').textContent = n.fixado ? "📌 Fixado" : "";
    node.querySelector('[data-action="delete"]').addEventListener("click", () => removeNotice(n.id));

    refs.noticeList.appendChild(node);
  });
}

function renderAll() {
  renderStats();
  renderStudents();
  renderNotices();
}

refs.studentForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);

  const payload = {
    nome: String(fd.get("nome") || "").trim(),
    email: String(fd.get("email") || "").trim(),
    telefone: String(fd.get("telefone") || "").trim(),
    curso: String(fd.get("curso") || "").trim(),
    status: String(fd.get("status") || "ativo"),
    progresso: Number(fd.get("progresso") || 0),
    tags: String(fd.get("tags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    observacoes: String(fd.get("observacoes") || "").trim(),
  };

  upsertStudent(payload);
});

refs.noticeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);

  addNotice({
    titulo: String(fd.get("titulo") || "").trim(),
    prioridade: String(fd.get("prioridade") || "normal"),
    publico: String(fd.get("publico") || "").trim(),
    expiraEm: String(fd.get("expiraEm") || ""),
    fixado: fd.get("fixado") === "on",
    mensagem: String(fd.get("mensagem") || "").trim(),
  });
});

refs.studentSearch.addEventListener("input", renderStudents);
refs.statusFilter.addEventListener("change", renderStudents);

refs.seedDataBtn.addEventListener("click", () => {
  state.students = [
    {
      id: uid(),
      nome: "Marina Costa",
      email: "marina@email.com",
      telefone: "(11) 98888-1111",
      curso: "Consultoria de Carreira",
      status: "ativo",
      progresso: 65,
      tags: ["vip", "engajada"],
      observacoes: "Enviar plano da semana e revisar currículo na quarta.",
      criadoEm: today(),
      ultimoContato: today(),
    },
    {
      id: uid(),
      nome: "Paulo Mendes",
      email: "paulo@email.com",
      telefone: "(21) 97777-2222",
      curso: "Mentoria de Negócios",
      status: "atenção",
      progresso: 30,
      tags: ["sumido", "follow-up"],
      observacoes: "Não respondeu últimas 2 mensagens. Ligar amanhã.",
      criadoEm: today(),
      ultimoContato: today(),
    },
  ];

  state.notices = [
    {
      id: uid(),
      titulo: "Aula ao vivo na terça",
      prioridade: "alta",
      publico: "Todos os alunos",
      expiraEm: "",
      fixado: true,
      mensagem: "A aula começa às 20h. Entrem 10 min antes para o check-in.",
      criadoEm: today(),
    },
  ];

  persist();
  renderAll();
});

load();
renderAll();
