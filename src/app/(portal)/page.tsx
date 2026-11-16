import Image from "next/image";
import { Suspense } from "react";
import { getRufNews, rufNewsUrl } from "@/data/ruf-news.server";
import styles from "./home.module.css";

const social = [
  { name: "Instagram", icon: "instagram", href: "https://www.instagram.com/rufdiamondltd/" },
  { name: "Facebook", icon: "facebook", href: "https://www.facebook.com/RufDiamond" },
  { name: "YouTube", icon: "youtube", href: "https://www.youtube.com/@rufdiamondltd.3860" },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/rufdiamond-ltd/" },
];

async function NewsList() {
  const items = await getRufNews();
  return items.length ? <ul className={styles.newsList}>
    {items.map(({ title, href }) => <li key={href}><a href={href} target="_blank" rel="noreferrer">{title}</a></li>)}
  </ul> : null;
}

export default function HomePage() {
  return (
    <div className={styles.stage}>
      <section className={styles.card}>
        <h2 className={styles.title}>User Guide</h2>
        <div className={styles.withIcon}>
          <p>Search by model, part number, or description to find the right parts and their exploded drawings.</p>
          <Image src="/home/icon-guide.png" alt="" width={480} height={216} className={styles.guideIcon} priority />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>Parts Ordering Information</h2>
        <div className={styles.withIcon}>
          <p>For urgent needs, email <a href="mailto:parts@rufdiamond.com">parts@rufdiamond.com</a> with the VIN, part numbers, quantities, and a short description.</p>
          <Image src="/home/icon-warning.png" alt="" width={480} height={480} className={styles.icon} />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>Parts Catalogues</h2>
        <div className={styles.withIcon}>
          <div>
            <ul className={styles.downloads}>
              <li><a href="/home/catalogues/fat-truck-sample.pdf" download>Fat Truck sample (PDF)</a></li>
              <li><a href="/home/catalogues/ironhorse-sample.pdf" download>IronHorse sample (PDF)</a></li>
            </ul>
            <p><a href="mailto:parts@rufdiamond.com?subject=PDF%20Parts%20Catalogue%20request">Request the current catalogue</a></p>
          </div>
          <Image src="/home/icon-pdf.png" alt="" width={480} height={480} className={styles.icon} />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>RUF Diamond Brochures</h2>
        <div className={styles.withIcon}>
          <p>Explore our equipment at <a href="https://www.rufdiamond.com/" target="_blank" rel="noreferrer">rufdiamond.com</a> or <a href="mailto:parts@rufdiamond.com?subject=Brochure%20request">request a brochure</a>.</p>
          <Image src="/home/icon-brochure.png" alt="" width={256} height={256} className={styles.icon} />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>Social Media</h2>
        <div className={styles.social}>
          <Image src="/home/social-promo.png" alt="" width={384} height={480} className={styles.promo} />
          <div>
            <p>Follow RUF Diamond for equipment updates and field stories.</p>
            <ul className={styles.socialLinks}>
              {social.map(item => <li key={item.name}>
                <a href={item.href} target="_blank" rel="noreferrer" aria-label={item.name}>
                  {item.icon ? <Image src={`/home/social-${item.icon}.png`} alt="" width={32} height={32} /> : <span className={styles.linkedin} aria-hidden="true">in</span>}
                </a>
              </li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>RUF Diamond News</h2>
        <Suspense><NewsList /></Suspense>
        <a href={rufNewsUrl} target="_blank" rel="noreferrer">View all News &amp; Events</a>
      </section>
    </div>
  );
}
