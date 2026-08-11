import screen from "@/styles/screen.module.css";
import { HomeHeader } from "./HomeHeader";
import { RecentlyViewed } from "./RecentlyViewed";
import { SearchPanel } from "./SearchPanel";

export default function HomePage() {
  return (
    <main className={screen.screen}>
      <HomeHeader />
      <SearchPanel />
      <RecentlyViewed />
    </main>
  );
}
