import express from 'express';
import path from 'path';

export class PublicRouter {
  constructor({ chatCoordinator, chatHistoryService }) {
    this.chatCoordinator = chatCoordinator;
    this.chatHistoryService = chatHistoryService;
    this.router = express.Router();
    this.registerRoutes();
  }

  registerRoutes() {
    this.router.get('/', (req, res) => {
      const filePath = path.join(process.cwd(), 'public', 'index.html');
      res.sendFile(filePath);
    });

    this.router.get('/api/session', (req, res) => {
      res.json({ sessionId: req.sessionId });
    });

    this.router.post('/api/chat', express.json(), async (req, res) => {
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }
      try {
        const result = await this.chatCoordinator.handleMessage({
          sessionId: req.sessionId,
          userMessage: message
        });
        res.json({ ...result, sessionId: req.sessionId });
      } catch (error) {
        res.status(500).json({ error: 'Unable to process the message' });
      }
    });

    this.router.get('/api/messages', (req, res) => {
      const messages = this.chatHistoryService.getConversation(req.sessionId);
      res.json({ sessionId: req.sessionId, messages });
    });
  }
}
