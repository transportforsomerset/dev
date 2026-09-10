/*
 * all-leaflet-cluster.js
 *
 * Experimental lightweight clusterer for the national
 * Leaflet 2.0 test map.
 *
 * This is NOT a drop-in replacement for the full
 * Leaflet.markercluster library.
 *
 * It currently provides:
 *   - marker storage
 *   - clustering by screen-space grid
 *   - click-to-zoom clusters
 *   - configurable cluster radius
 *   - configurable zoom level at which clustering stops
 *   - chunked marker loading
 *
 * It deliberately does not attempt to reproduce:
 *   - spiderfy
 *   - animated clustering
 *   - convex hulls
 *   - distance-based neighbour clustering
 *   - all MarkerClusterGroup APIs
 */

  class MarkerClusterGroup extends L.FeatureGroup {
    constructor(options = {}) {
      super();

      this.options = {
        maxClusterRadius: 50,
        disableClusteringAtZoom: 16,
        chunkedLoading: false,
        chunkInterval: 50,
        chunkDelay: 10,
        ...options,
      };

      /*
       * Use a Set rather than Leaflet's private
       * _leaflet_id property.
       *
       * This keeps the clusterer independent of
       * Leaflet's internal marker implementation.
       */
      this._markers = new Set();

      this._rendered = new Set();

      this._map = null;
      this._refreshScheduled = false;
      this._loading = false;
      this._boundRefresh = null;
    }

    onAdd(map) {
      super.onAdd(map);

      this._map = map;

      this._boundRefresh = () => {
        this._scheduleRefresh();
      };

      map.on(
        "zoomend moveend resize",
        this._boundRefresh
      );

      this._scheduleRefresh();
    }

    onRemove(map) {
      if (this._boundRefresh) {
        map.off(
          "zoomend moveend resize",
          this._boundRefresh
        );
      }

      this._clearRendered();

      this._map = null;
      this._boundRefresh = null;

      super.onRemove(map);
    }

    addLayer(marker) {
      if (!marker) {
        return this;
      }

      this._markers.add(marker);

      if (this._map) {
        this._scheduleRefresh();
      }

      return this;
    }

    addLayers(markers) {
      const list = Array.from(markers ?? []);

      if (!this.options.chunkedLoading) {
        for (const marker of list) {
          if (marker) {
            this._markers.add(marker);
          }
        }

        this._refresh();

        return this;
      }

      this._loading = true;

      let index = 0;

      const step = () => {
        const start = performance.now();

        while (
          index < list.length &&
          performance.now() - start <
            this.options.chunkInterval
        ) {
          const marker = list[index++];

          if (marker) {
            this._markers.add(marker);
          }
        }

        if (index < list.length) {
          setTimeout(
            step,
            this.options.chunkDelay
          );
        } else {
          this._loading = false;
          this._refresh();
        }
      };

      step();

      return this;
    }

    removeLayer(marker) {
      if (marker) {
        this._markers.delete(marker);
      }

      if (this._map) {
        this._refresh();
      }

      return this;
    }

    clearLayers() {
      this._markers.clear();

      if (this._map) {
        this._clearRendered();
      }

      return this;
    }

    hasLayer(layer) {
      return this._markers.has(layer);
    }

    getLayers() {
      return Array.from(this._markers);
    }

    _scheduleRefresh() {
      if (
        this._refreshScheduled ||
        !this._map
      ) {
        return;
      }

      this._refreshScheduled = true;

      requestAnimationFrame(() => {
        this._refreshScheduled = false;
        this._refresh();
      });
    }

    _clearRendered() {
      if (!this._map) {
        return;
      }

      for (const layer of this._rendered) {
        this._map.removeLayer(layer);
      }

      this._rendered.clear();
    }

    _refresh() {
      if (
        !this._map ||
        this._loading
      ) {
        return;
      }

      this._clearRendered();

      const markers = Array.from(
        this._markers
      );

      const zoom = this._map.getZoom();

      /*
       * At or above the configured zoom level,
       * show individual markers.
       */
if (
  zoom >=
  this.options.disableClusteringAtZoom
) {
  const bounds = this._map.getBounds().pad(0.25);

  for (const marker of markers) {
    if (bounds.contains(marker.getLatLng())) {
      this._map.addLayer(marker);
      this._rendered.add(marker);
    }
  }

  return;
}

      /*
       * At lower zoom levels, group markers
       * into screen-space grid cells.
       */
      const clusters =
        this._buildClusters(
          markers,
          zoom
        );

      for (const group of clusters) {
        if (group.length === 1) {
          const marker = group[0];

          this._map.addLayer(marker);
          this._rendered.add(marker);
        } else {
          const cluster =
            this._createCluster(group);

          this._map.addLayer(cluster);
          this._rendered.add(cluster);
        }
      }
    }

    _buildClusters(markers, zoom) {
      /*
       * maxClusterRadius is the approximate
       * radius in screen pixels.
       *
       * Using twice the radius gives us square
       * grid cells approximately matching the
       * requested clustering distance.
       */
      const size = Math.max(
        1,
        this.options.maxClusterRadius * 2
      );

      const buckets = new Map();

      for (const marker of markers) {
        const point = this._map.project(
          marker.getLatLng(),
          zoom
        );

        const key =
          `${Math.floor(point.x / size)}:` +
          `${Math.floor(point.y / size)}`;

        let bucket =
          buckets.get(key);

        if (!bucket) {
          bucket = [];
          buckets.set(key, bucket);
        }

        bucket.push(marker);
      }

      return Array.from(
        buckets.values()
      );
    }

_createCluster(markers) {
  const count = markers.length;

  let sizeClass = "";

  if (count >= 100) {
    sizeClass = "large";
  } else if (count < 10) {
    sizeClass = "small";
  }

const icon = new L.DivIcon({
  className: "",
  html:
    `<div class="all-cluster ${sizeClass}" ` +
    `style="border-style: dashed; border-radius: 50%;">` +
    `${count}` +
    `</div>`,
  iconSize: [50, 50],
  iconAnchor: [25, 25],
});

  const cluster = new L.Marker(
    this._center(markers),
    {
      icon,
    }
  );

  cluster.on("click", () => {
    if (!this._map) {
      return;
    }

    const bounds =
      new L.LatLngBounds(
        markers.map((marker) =>
          marker.getLatLng()
        )
      );

    if (!bounds.isValid()) {
      return;
    }

    this._map.fitBounds(
      bounds,
      {
        padding: [30, 30],
        maxZoom:
          this._map.getZoom() + 2,
      }
    );
  });

  return cluster;
}

    _center(markers) {
      let lat = 0;
      let lng = 0;

      for (const marker of markers) {
        const position =
          marker.getLatLng();

        lat += position.lat;
        lng += position.lng;
      }

      return [
        lat / markers.length,
        lng / markers.length,
      ];
    }
  }

 export { MarkerClusterGroup };
