(function () {
  const $ = (seletor) => document.querySelector(seletor);
  const form = $("#form-login");
  const cpfInput = $("#login-cpf");
  const senhaInput = $("#login-senha");
  const erro = $("#login-erro");
  const enviar = $("#login-enviar");
  let ocupado = false;

  function mascaraCpf(valor) {
    const digitos = String(valor).replace(/\D/g, "").slice(0, 11);
    return digitos
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function mostrarErro(texto) {
    erro.textContent = texto;
    erro.hidden = !texto;
  }

  async function lerJson(resposta) {
    try {
      return await resposta.json();
    } catch (e) {
      return null;
    }
  }

  cpfInput.addEventListener("input", () => {
    cpfInput.value = mascaraCpf(cpfInput.value);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ocupado) return;
    mostrarErro("");

    const senha = senhaInput.value;
    if (senha.length < 6) {
      mostrarErro("A senha precisa ter pelo menos 6 caracteres.");
      senhaInput.focus();
      return;
    }

    ocupado = true;
    enviar.disabled = true;

    try {
      const resposta = await fetch(new URL("api/sessao.php", window.location.href), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          cpf: cpfInput.value,
          senha
        })
      });
      const dados = await lerJson(resposta);
      if (!resposta.ok) {
        mostrarErro((dados && dados.erro) || "Não foi possível entrar.");
        return;
      }
      window.location.replace("index.html");
    } catch (e) {
      mostrarErro("Não foi possível conectar ao banco.");
    } finally {
      ocupado = false;
      enviar.disabled = false;
    }
  });

  fetch(new URL("api/sessao.php", window.location.href), { cache: "no-store", credentials: "same-origin" })
    .then(async (resposta) => {
      const dados = await lerJson(resposta);
      if (!resposta.ok) {
        mostrarErro((dados && dados.erro) || "Não foi possível verificar o acesso.");
        return;
      }
      if (dados && dados.autenticado) {
        window.location.replace("index.html");
        return;
      }
      cpfInput.focus();
    })
    .catch(() => {
      mostrarErro("Não foi possível conectar ao banco.");
    });
})();
