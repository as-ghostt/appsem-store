import { Link } from "react-router-dom";
import { Download, Heart, Star } from "lucide-react";
import { categoryMap } from "../data/categories";
import RatingStars from "./RatingStars";
import { fallbackIcon, showFallbackAppIcon } from "../utils/appIconFallback.js";


function formatNumber(value) {
  return new Intl.NumberFormat("es-PE", { notation: Number(value || 0) >= 10000 ? "compact" : "standard" }).format(value || 0);
}

export default function AppCard({ app }) {
  return (
    <article className="app-card">
      <Link to={`/app/${app.slug}`} className="app-card-main" aria-label={`Ver detalles de ${app.title}`}>
        <img className="app-icon" src={app.iconUrl || fallbackIcon} alt={`Icono de ${app.title}`} loading="lazy" onError={showFallbackAppIcon} />
        <div className="app-card-content">
          <span className="app-category">{categoryMap[app.categoryKey] || app.category || "App"}</span>
          <h3>{app.title}</h3>
          <p>{app.shortDescription || "Aplicación disponible en Appsem Store."}</p>
        </div>
      </Link>

      <div className="app-card-meta">
        <span title="Valoración">
          <Star size={16} fill="currentColor" /> {Number(app.ratingAverage || 0).toFixed(1)}
        </span>
        <span title="Me gusta">
          <Heart size={16} /> {formatNumber(app.likesCount)}
        </span>
        <span title="Clics de descarga">
          <Download size={16} /> {formatNumber(app.downloadsCount)}
        </span>
      </div>

      <div className="app-card-footer">
        <RatingStars value={Math.round(app.ratingAverage || 0)} size={15} />
        <Link className="card-button" to={`/app/${app.slug}`}>Ver detalles</Link>
      </div>
    </article>
  );
}
