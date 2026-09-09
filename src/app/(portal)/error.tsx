"use client";
export default function CatalogueError() {
  return <main><h1>Catalogue unavailable</h1><p>Your access or the catalogue release may have changed. Refresh to load authorized current data.</p><button type="button" onClick={() => window.location.reload()}>Refresh catalogue</button><p><a href="/signin">Sign in</a> · <a href="/machine">Select a machine</a></p></main>;
}
