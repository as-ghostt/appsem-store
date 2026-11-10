import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Download,
  Heart,
  Info,
  Shield
} from "lucide-react";
import AppCard from "../components/AppCard";
import { useVerifiedMetrics } from "../services/verifiedInteractions";
import { validatedDownloadUrl } from "../services/safeDownloadUrl";
import CommentSection from "../components/CommentSection";
import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import RatingStars from "../components/RatingStars";
import ScreenshotGallery from "../components/ScreenshotGallery";
import Seo from "../components/Seo";
import { categoryMap } from "../data/categories";
import {
  checkUserInteraction,
  getAppBySlug,
  getApprovedComments,
  getPublishedApps,
  likeApp,
  registerDownloadClick,
  submitRating
} from "../services/appsService";

const fallbackIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='28' fill='%231e293b'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='34' font-weight='700' fill='white'%3EAS%3C/text%3E%3C/svg%3E";

function formatNumber(value) {
  return new Intl.NumberFormat("es-PE", {
    notation: Number(value || 0) >= 10000 ? "compact" : "standard"
  }).format(value || 0);
}

function SecurityLink({ href, children }) {
  if (!href) return null;
  return (
    <a className="outline-button" href={href} target="_blank" rel="noopener noreferrer">
      <BadgeCheck size={18} /> {children}
    </a>
  );
}

export default function AppDetails() {
  const { slug } = useParams();
  const [app, setApp] = useState(null);
  const [allApps, setAllApps] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liked, setLiked] = useState(false);
  const [rated, setRated] = useState(null);
  const [interactionPending, setInteractionPending] = useState(false);
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadReady, setDownloadReady] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const interactionPendingRef = useRef(false);
  const downloadPendingRef = useRef(false);
  const [interactionMessage, setInteractionMessage] = useState("");
  const [aboutExpanded, setAboutExpanded] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadApp() {
      setLoading(true);
      setError("");
      setDownloadReady("");
      setDownloadMessage("");
      setLiked(false);
      setRated(null);
      setInteractionMessage("");

      try {
        const [data, publishedApps] = await Promise.all([
          getAppBySlug(slug),
          getPublishedApps()
        ]);
        if (!alive) return;

        setApp(data);
        setAllApps(publishedApps || []);

        if (data) {
          // Métricas y comentarios son secundarios: si falla la API en el
          // despliegue coordinado, el catálogo y los enlaces siguen accesibles.
          const [commentResult, interactionResult] = await Promise.allSettled([
            getApprovedComments(data.id),
            checkUserInteraction(data.id)
          ]);
          if (!alive) return;
          setComments(commentResult.status === "fulfilled" ? commentResult.value : []);
          if (interactionResult.status === "fulfilled") {
            setLiked(Boolean(interactionResult.value.liked));
            setRated(interactionResult.value.rated ?? null);
          } else {
            setInteractionMessage("No se pudo consultar tu valoración anterior. Puedes seguir navegando.");
          }
        }
      } catch (err) {
        console.error(err);
        if (alive) setError("No se pudo cargar la información de esta app.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadApp();
    return () => { alive = false; };
  }, [slug]);

  const relatedApps = useMemo(() => {
    if (!app) return [];
    return allApps
      .filter((item) => item.id !== app.id)
      .sort((a, b) => {
        const aSameCategory = a.categoryKey === app.categoryKey ? 1 : 0;
        const bSameCategory = b.categoryKey === app.categoryKey ? 1 : 0;
        return bSameCategory - aSameCategory;
      })
      .slice(0, 4);
  }, [allApps, app]);

  async function handleLike() {
    if (!app || liked || interactionPendingRef.current) return;
    interactionPendingRef.current = true;
    setInteractionPending(true);
    setInteractionMessage("");
    try {
      const result = await likeApp(app.id);
      if (result.alreadyLiked) {
        setLiked(true);
        setInteractionMessage("Ya diste me gusta a esta app.");
        return;
      }
      setLiked(true);
      setApp((current) => ({ ...current, likesCount: Number(current.likesCount || 0) + 1 }));
      setInteractionMessage("Gracias por tu me gusta.");
    } catch (err) {
      console.error(err);
      setInteractionMessage("No se pudo registrar el me gusta.");
    } finally {
      interactionPendingRef.current = false;
      setInteractionPending(false);
    }
  }

  async function handleRate(value) {
    if (!app || rated || interactionPendingRef.current) return;
    interactionPendingRef.current = true;
    setInteractionPending(true);
    setInteractionMessage("");
    try {
      const result = await submitRating(app.id, value);
      if (result.alreadyRated) {
        setRated(result.rating ?? value);
        setInteractionMessage("Ya valoraste esta app anteriormente.");
        return;
      }
      setRated(value);
      setApp((current) => ({
        ...current,
        ratingAverage: result.ratingAverage,
        ratingCount: result.ratingCount
      }));
      setInteractionMessage("Gracias por valorar esta app.");
    } catch (err) {
      console.error(err);
      setInteractionMessage("No se pudo guardar la valoración.");
    } finally {
      interactionPendingRef.current = false;
      setInteractionPending(false);
    }
  }

  async function openDownload(url) {
    if (!url || !app || downloadPendingRef.current) return;
    if (!useVerifiedMetrics) {
      // No cambiar el comportamiento heredado hasta el corte coordinado.
      try {
        const tracked = await registerDownloadClick(app, url);
        if (!tracked?.alreadyRecorded) {
          setApp((current) => ({ ...current, downloadsCount: Number(current.downloadsCount || 0) + 1 }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return;
    }

    // Una verificación Turnstile asíncrona pierde el gesto de usuario para window.open.
    // Ofrecer el enlace en un segundo clic evita bloqueos emergentes.
    const safeUrl = validatedDownloadUrl(url);
    if (!safeUrl) {
      setDownloadMessage("El enlace oficial no es una URL HTTPS válida.");
      return;
    }
    downloadPendingRef.current = true;
    setDownloadPending(true);
    setDownloadReady("");
    setDownloadMessage("Verificando la descarga...");
    try {
      const tracked = await registerDownloadClick(app, url);
      if (!tracked?.alreadyRecorded) {
        setApp((current) => ({ ...current, downloadsCount: Number(current.downloadsCount || 0) + 1 }));
      }
      setDownloadMessage("Verificación completada. Pulsa «Abrir descarga» para continuar.");
    } catch (err) {
      console.error(err);
      // El enlace oficial puede seguir accesible aunque las métricas fallen.
      setDownloadMessage("No se pudo registrar el clic. Puedes abrir la descarga oficial igualmente.");
    } finally {
      setDownloadReady(safeUrl);
      setDownloadPending(false);
      downloadPendingRef.current = false;
    }
  }

  async function reloadComments() {
    if (!app) return;
    setComments(await getApprovedComments(app.id));
  }

  if (loading) return <main className="container page-pad"><LoadingState text="Cargando ficha de la app..." /></main>;
  if (error) return <main className="container page-pad"><div className="error-box">{error}</div></main>;
  if (!app) {
    return (
      <main className="container page-pad">
        <EmptyState title="App no encontrada" message="La app no existe o todavía no está publicada." />
        <Link className="back-link" to="/"><ArrowLeft size={18} /> Volver a la tienda</Link>
      </main>
    );
  }

  const bannerStyle = app.bannerUrl
    ? { backgroundImage: `linear-gradient(100deg, rgba(4, 10, 25, .72), rgba(4, 10, 25, .24)), url(${app.bannerUrl})` }
    : undefined;
  const directDownloadUrl = app.downloadUrl || app.apkUrl || app.playStoreUrl;
  const categoryLabel = categoryMap[app.categoryKey] || app.category || "App";
  const description = app.seoDescription || app.shortDescription || app.fullDescription || `Descubre ${app.title} en Appsem Store.`;
  const appUrl = `${(import.meta.env.VITE_PUBLIC_SITE_ORIGIN || 'https://appsem-store.pages.dev').replace(/[/]$/, '')}/app/${app.slug}`;
  const privacyPolicyUrl = app.privacyPolicyUrl || "";
  const termsUrl = app.termsUrl || "";
  const legalNoticeUrl = app.legalNoticeUrl || "";
  const accountDeletionUrl = app.accountDeletionUrl || "";
  const securityReportUrl = app.securityReportUrl || "";
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: app.title,
    description,
    url: appUrl,
    image: app.bannerUrl || app.iconUrl,
    operatingSystem: app.operatingSystem || "Android",
    applicationCategory: categoryLabel,
    softwareVersion: app.currentVersion || undefined,
    fileSize: app.appSize || undefined,
    author: { "@type": "Organization", name: app.developer || "AppsMart Technology" },
    offers: {
      "@type": "Offer",
      price: String(app.price || "Gratis").toLowerCase().includes("gratis") ? "0" : undefined,
      priceCurrency: "USD"
    },
    aggregateRating: Number(app.ratingCount || 0) > 0 ? {
      "@type": "AggregateRating",
      ratingValue: Number(app.ratingAverage || 0).toFixed(1),
      ratingCount: Number(app.ratingCount || 0)
    } : undefined
  };

  return (
    <main>
      <Seo
        title={app.title}
        description={description}
        path={`/app/${app.slug}`}
        image={app.bannerUrl || app.iconUrl || undefined}
        type="product"
        schema={schema}
      />

      <section className="app-detail-hero app-detail-hero-v4">
        <div className="container app-detail-hero-inner">
          <Link className="back-link light app-detail-back" to="/" aria-label="Volver a la tienda"><ArrowLeft size={18} /></Link>
          <div className="app-detail-banner" style={bannerStyle} aria-label={`Banner de ${app.title}`} />
          <div className="app-summary-wrap">
            <div className="app-summary-card">
              <div className="app-summary-head">
                <img className="app-summary-icon" src={app.iconUrl || fallbackIcon} alt={`Icono de ${app.title}`} />
                <div className="app-summary-copy">
                  <span className="app-category light-category app-summary-category">{categoryLabel}</span>
                  <h1>{app.title}</h1>
                  <div className="detail-rating-line app-summary-rating">
                    <RatingStars value={Math.round(app.ratingAverage || 0)} />
                    <strong>{Number(app.ratingAverage || 0).toFixed(1)}</strong>
                    <span>· {formatNumber(app.ratingCount)} valoraciones</span>
                  </div>
                </div>
              </div>
              <div className="app-summary-stats" aria-label="Estadísticas de la app">
                <div className="app-summary-stat app-summary-like-count"><strong><Heart size={16} /> {formatNumber(app.likesCount)}</strong><span>Me gusta</span></div>
                <div className="app-summary-stat"><strong>{app.appSize || "—"}</strong><span>Tamaño</span></div>
                <div className="app-summary-stat"><strong>{formatNumber(app.downloadsCount)}</strong><span>Descargas iniciadas</span></div>
                <div className="app-summary-stat"><strong>{Number(app.ratingAverage || 0).toFixed(1)}</strong><span>Valoración</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container detail-layout">
        <div className="detail-main">
          <div className="app-download-actions" aria-label="Opciones de descarga">
            <button className="app-direct-download" onClick={() => openDownload(directDownloadUrl)} disabled={!directDownloadUrl || downloadPending} type="button">
              <Download size={19} /> Descargar
            </button>
            <button className="app-play-store-button" onClick={() => openDownload(app.playStoreUrl)} disabled={!app.playStoreUrl || downloadPending} type="button">
              <span className="play-store-mark" aria-hidden="true">▶</span> Google Play
            </button>
            <button className={`app-like-button ${liked ? "active" : ""}`} onClick={handleLike} disabled={liked || interactionPending} type="button">
              <Heart size={19} fill={liked ? "currentColor" : "none"} /> {liked ? "Te gusta" : "Me gusta"}
            </button>
          </div>

          {useVerifiedMetrics && downloadMessage ? (
            <div className="form-message" role="status">
              <p>{downloadMessage}</p>
              {downloadReady ? (
                <a className="app-direct-download" href={downloadReady} target="_blank" rel="noopener noreferrer">
                  <Download size={19} /> Abrir descarga
                </a>
              ) : null}
            </div>
          ) : null}

          {app.apkUrl || app.downloadUrl ? (
            <p className="muted-text">Descarga oficial proporcionada por {app.developer || "AppsMart Technology"}. Verifica la versión y el origen antes de instalar.</p>
          ) : null}

          <section className="app-screenshots-section" aria-label={`Capturas de pantalla de ${app.title}`}>
            <ScreenshotGallery screenshots={app.screenshots} title={app.title} />
          </section>

          <section className={`app-about-section ${aboutExpanded ? "expanded" : ""}`}>
            <button className="app-about-toggle" type="button" onClick={() => setAboutExpanded((current) => !current)} aria-expanded={aboutExpanded} aria-controls="app-about-content">
              <span>Acerca de la app</span>{aboutExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
            </button>
            {aboutExpanded ? <div id="app-about-content" className="app-about-content"><p className="long-text">{app.fullDescription || app.shortDescription || "Descripción no disponible."}</p></div> : null}
          </section>

          <section className="info-card">
            <h2><Info size={20} /> Información</h2>
            <dl>
              <div><dt>Tamaño</dt><dd>{app.appSize || "No especificado"}</dd></div>
              <div><dt>Sistema operativo</dt><dd>{app.operatingSystem || "Android"}</dd></div>
              <div><dt>Android requerido</dt><dd>{app.minAndroidVersion || "No especificado"}</dd></div>
              <div><dt>Versión actual</dt><dd>{app.currentVersion || "No especificado"}</dd></div>
              <div><dt>Última actualización</dt><dd>{app.lastUpdate || "No especificado"}</dd></div>
              <div><dt>Idiomas</dt><dd>{app.languages || "No especificado"}</dd></div>
              <div><dt>Uso sin conexión</dt><dd>{app.offlineUse || "No especificado"}</dd></div>
              <div><dt>Contiene anuncios</dt><dd>{app.containsAds || "No especificado"}</dd></div>
              <div><dt>Compras dentro de la app</dt><dd>{app.inAppPurchases || "No especificado"}</dd></div>
              <div><dt>Clasificación por edad</dt><dd>{app.ageRating || "No especificado"}</dd></div>
              <div><dt>Precio</dt><dd>{app.price || "No especificado"}</dd></div>
              <div><dt>Nombre del paquete</dt><dd>{app.packageName || "No especificado"}</dd></div>
              <div><dt>Desarrollador</dt><dd>{app.developer || "AppsMart Technology"}</dd></div>
              {app.sha256 ? <div><dt>SHA-256</dt><dd className="long-text">{app.sha256}</dd></div> : null}
            </dl>
          </section>

          <section className="info-card">
            <h2><Shield size={20} /> Seguridad, privacidad y soporte</h2>
            <div className="app-download-actions">
              <SecurityLink href={privacyPolicyUrl}>Política de privacidad</SecurityLink>
              <SecurityLink href={termsUrl}>Términos de servicio</SecurityLink>
              <SecurityLink href={legalNoticeUrl}>Aviso legal</SecurityLink>
              <SecurityLink href={accountDeletionUrl}>Eliminación de cuenta y datos</SecurityLink>
              <SecurityLink href={securityReportUrl}>Reporte de seguridad y vulnerabilidades</SecurityLink>
            </div>
            {!privacyPolicyUrl && !termsUrl && !legalNoticeUrl && !accountDeletionUrl && !securityReportUrl ? (
              <p className="muted-text">No se agregaron enlaces legales individuales para esta app.</p>
            ) : null}
          </section>

          {relatedApps.length > 0 ? (
            <section className="info-card">
              <h2>También te puede interesar</h2>
              <div className="apps-grid">{relatedApps.map((item) => <AppCard app={item} key={item.id} />)}</div>
            </section>
          ) : null}

          <CommentSection
            appId={app.id}
            comments={comments}
            onCommentSent={reloadComments}
            rated={rated}
            ratingPending={interactionPending}
            onRate={handleRate}
            interactionMessage={interactionMessage}
          />
        </div>
      </section>
    </main>
  );
}
