import { useEffect, useRef } from "react";
export default function Captcha({ onToken }) {
  const ref = useRef();
  const key = import.meta.env.VITE_HCAPTCHA_SITE_KEY;
  useEffect(() => {
    if (!key) return;
    let id,
      alive = true;
    const render = () => {
      if (alive && ref.current && window.hcaptcha)
        id = window.hcaptcha.render(ref.current, {
          sitekey: key,
          theme: "dark",
          callback: onToken,
          "expired-callback": () => onToken(""),
        });
    };
    let script = document.querySelector("script[data-hcaptcha]");
    if (window.hcaptcha) render();
    else {
      if (!script) {
        script = document.createElement("script");
        script.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
        script.async = true;
        script.dataset.hcaptcha = "true";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      alive = false;
      script?.removeEventListener("load", render);
      if (id !== undefined) window.hcaptcha?.remove(id);
    };
  }, [key, onToken]);
  return key ? <div className="captcha" ref={ref} /> : null;
}
