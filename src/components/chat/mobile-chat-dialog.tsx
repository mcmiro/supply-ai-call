import React from 'react';
import { useChatContext } from '../../contexts/chat-context';
import { Dialog, DialogContent } from '../ui/dialog';
import { ChatInterface } from './index';

export const MobileChatDialog: React.FC = () => {
  const {
    isMobileDialogOpen,
    setFlowStep,
    setIsConnected,
    setIsMobileDialogOpen,
  } = useChatContext();

  const handleOpenChange = (open: boolean) => {
    setIsMobileDialogOpen(open);

    if (!open) {
      setIsConnected(false);
      setFlowStep('intro');
    }
  };

  return (
    <Dialog open={isMobileDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="md:hidden w-full h-full max-w-none max-h-none p-0 border-0 rounded-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="h-full w-full">
          <ChatInterface isMobile={true} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
