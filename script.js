async function mountNav(){
  const host = document.getElementById("nav-host");
  if(!host) return;

const res = await fetch("./nav.html?v=1", { cache: "force-cache" });

  host.innerHTML = await res.text();

  const nav = host.querySelector(".site-nav");
  const toggle = host.querySelector(".nav-toggle");
  const links = host.querySelectorAll(".nav-link");

  // ===== Active link =====
  const cur = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  links.forEach(a => {
    const m = (a.dataset.match || "").toLowerCase();
    if(!m) return;
    if (m === cur || cur.includes(m)) a.classList.add("active");
  });

  // ===== Mobile toggle =====
  const closeNav = () => {
    if(!nav || !toggle) return;
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const openNav = () => {
    if(!nav || !toggle) return;
    nav.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
  };

  const toggleNav = () => {
    if(!nav || !toggle) return;
    const isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  };

  if(toggle && nav){
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNav();
    });

    // đóng menu khi click link
    links.forEach(a => a.addEventListener("click", () => closeNav()));

    // click ra ngoài để đóng
    document.addEventListener("click", (e) => {
      if(!nav.classList.contains("open")) return;
      const inside = nav.contains(e.target);
      if(!inside) closeNav();
    });

    // ESC để đóng
    document.addEventListener("keydown", (e) => {
      if(e.key === "Escape") closeNav();
    });
  }

  // ===== Theme button (nếu có) =====
  const btnTheme = host.querySelector("#btnTheme");
  if(btnTheme){
    btnTheme.addEventListener("click", () => {
      document.documentElement.classList.toggle("light");
    });
  }
}

mountNav();
