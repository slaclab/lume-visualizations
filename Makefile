CANONICAL_DIR := lume_visualizations
VENDORED_DIR  := deploy/kubernetes/live-monitor-ui

UI_FILES := live_stream_monitor.py live_stream_monitor.css live_stream_monitor.head.html

.PHONY: sync-k8s-ui
sync-k8s-ui:
	@for f in $(UI_FILES); do \
		cp $(CANONICAL_DIR)/$$f $(VENDORED_DIR)/$$f && echo "Synced $$f"; \
	done
