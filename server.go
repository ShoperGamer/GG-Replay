package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type Server struct {
	httpServer *http.Server
	queue      *JobQueue
	mux        *http.ServeMux
}

func NewServer(port int, queue *JobQueue) *Server {
	s := &Server{
		queue: queue,
		mux:   http.NewServeMux(),
	}

	s.mux.HandleFunc("/health", s.handleHealth)
	s.mux.HandleFunc("/create_song", s.handleCreateSong)
	s.mux.HandleFunc("/song_progress", s.handleSongProgress)
	s.mux.HandleFunc("/device_options", s.handleDeviceOptions)
	s.mux.HandleFunc("/stop_job", s.handleStopJob)

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf("127.0.0.1:%d", port),
		Handler:      s.corsMiddleware(s.mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	return s
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) Start() error {
	log.Printf("[Web Server] Listening API on boundary address: -> http://%s", s.httpServer.Addr)
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.writeJSON(w, http.StatusOK, HealthResp{Status: "ok", Timestamp: time.Now().Unix()})
}

func (s *Server) handleCreateSong(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CreateSongReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON payload: %v", err), http.StatusBadRequest)
		return
	}

	jobID := "job_" + uuid.New().String()
	job := Job{
		ID:        jobID,
		Request:   req,
		CreatedAt: time.Now(),
	}

	status := &JobProgressResp{
		Status:    StatusQueued,
		Message:   "Waiting in Go internal engine queue...",
		JobId:     jobID,
		TrackName: getTrackName(req.SongUrlOrFilePath),
		ModelId:   req.ModelId,
	}
	s.queue.running.Store(jobID, status)
	s.queue.Submit(job)

	s.writeJSON(w, http.StatusOK, CreateSongResp{JobId: jobID})
}

func (s *Server) handleSongProgress(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req JobProgressReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid query format", http.StatusBadRequest)
		return
	}

	status, exists := s.queue.GetJobStatus(req.JobId)
	if !exists {
		s.writeJSON(w, http.StatusOK, JobProgressResp{Status: StatusUnknown, Message: "Error: Job identification token not found"})
		return
	}

	s.writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleDeviceOptions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	devices := []string{"cpu"}
	if s.queue.deviceInfo.HasCUDA {
		devices = append(devices, "cuda")
	}
	if s.queue.deviceInfo.HasMPS {
		devices = append(devices, "mps")
	}

	s.writeJSON(w, http.StatusOK, DeviceOptionsResp{Devices: devices})
}

func (s *Server) handleStopJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req StopJobReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid token target specification", http.StatusBadRequest)
		return
	}

	s.queue.StopJob(req.JobId)
	s.writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": fmt.Sprintf("Graceful destruction signal relayed to Job %s", req.JobId),
	})
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}