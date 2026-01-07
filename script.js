  async function mountNav(){
    const host = document.getElementById("nav-host");
    if(!host) return;

    const res = await fetch("./nav.html", { cache: "no-store" });
    host.innerHTML = await res.text();

    // active link
    const cur = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    host.querySelectorAll(".nav-link").forEach(a => {
      const m = (a.dataset.match || "").toLowerCase();
      if(m === cur) a.classList.add("active");
    });

    // mobile toggle
    const nav = host.querySelector(".site-nav");
    const toggle = host.querySelector(".nav-toggle");
    if(toggle && nav){
      toggle.addEventListener("click", () => {
        const isOpen = nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(isOpen));
      });
    }

    // theme button (demo)
    const btnTheme = host.querySelector("#btnTheme");
    if(btnTheme){
      btnTheme.addEventListener("click", () => {
        document.documentElement.classList.toggle("light");
      });
    }
  }

  mountNav();