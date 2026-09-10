/*
 * all-leaflet-cluster.js
 *
 * Experimental lightweight clusterer for the national
 * Leaflet 2.0 test map.
 *
 * This is NOT a drop-in replacement for the full
 * Leaflet.markercluster library. It implements only
 * the functionality currently needed by all-leaflet.js.
 */

(() => {
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

      this._markers = new Map();
      this._rendered = new Set();
      this._map = null;
      this._refreshScheduled = false;
      this._loading = false;
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
      map.off(
        "zoomend moveend resize",
        this._boundRefresh
      );

      this._clearRendered();
      this._map = null;

      super.onRemove(map);
    }

    addLayer(marker) {
      if (!marker) return this;

      this._markers.set(
        marker._leaflet_id,
        marker
      );

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
            this._markers.set(
              marker._leaflet_id,
              marker
            );
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
            this._markers.set(
              marker._leaflet_id,
              marker
            );
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
        this._markers.delete(
          marker._leaflet_id
        );
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
      return (
        !!layer &&
        this._markers.has(
          layer._leaflet_id
        )
      );
    }

    getLayers() {
      return Array.from(
        this._markers.values()
      );
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
        this._markers.values()
      );

      const zoom = this._map.getZoom();

      /*
       * At high zoom levels, show individual buses.
       */
      if (
        zoom >=
        this.options.disableClusteringAtZoom
      ) {
        for (const marker of markers) {
          this._map.addLayer(marker);
          this._rendered.add(marker);
        }

        return;
      }

      /*
       * Otherwise divide the projected map into
       * square buckets and cluster markers that
       * fall into the same bucket.
       */
      for (const group of this._buildClusters(
        markers,
        zoom
      )) {
        if (group.length === 1) {
          this._map.addLayer(group[0]);
          this._rendered.add(group[0]);
        } else {
          const cluster =
            this._createCluster(group);

          this._map.addLayer(cluster);
          this._rendered.add(cluster);
        }
      }
    }

    _buildClusters(markers, zoom) {
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

        if (!buckets.has(key)) {
          buckets.set(key, []);
        }

        buckets.get(key).push(marker);
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
          `<div class="all-cluster ${sizeClass}">` +
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
        const bounds =
          new L.LatLngBounds(
            markers.map((marker) =>
              marker.getLatLng()
            )
          );

        if (bounds.isValid()) {
          this._map.fitBounds(
            bounds,
            {
              padding: [30, 30],
              maxZoom:
                this._map.getZoom() + 2,
            }
          );
        }
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

  /*
   * Expose both the class and the traditional
   * factory name so the experiment is easy to
   * adapt later.
   */
  L.MarkerClusterGroup =
    MarkerClusterGroup;

  L.markerClusterGroup = (options) =>
    new MarkerClusterGroup(options);
})();
