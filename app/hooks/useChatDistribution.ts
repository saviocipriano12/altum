// src/hooks/useChatDistribution.ts
import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc,
  orderBy 
} from 'firebase/firestore';
import { db, auth } from '@/firebaseConfig';

type ChatDistributionDoc = {
  id: string;
  assignedTo?: string | null;
  status?: string;
  lastMessageAt?: unknown;
};

export const useChatDistribution = () => {
  const [unassignedChats, setUnassignedChats] = useState<ChatDistributionDoc[]>([]);
  const [myChats, setMyChats] = useState<ChatDistributionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) return;

    // 1. Escutar chats que NÃO têm dono (Inbox Geral)
    const qUnassigned = query(
      collection(db, 'chats'),
      where('assignedTo', '==', null), // Ninguém pegou ainda
      where('status', '==', 'open'),
      orderBy('lastMessageAt', 'desc')
    );

    // 2. Escutar chats que são MEUS (Minha Carteira)
    const qMine = query(
      collection(db, 'chats'),
      where('assignedTo', '==', currentUser.uid), // É meu
      orderBy('lastMessageAt', 'desc')
    );

    // Inscrevendo nos canais
    const unsubUnassigned = onSnapshot(qUnassigned, (snapshot) => {
      setUnassignedChats(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubMine = onSnapshot(qMine, (snapshot) => {
      setMyChats(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubUnassigned();
      unsubMine();
    };
  }, [currentUser]);

  // Função para o vendedor "Pegar" o cliente
  const claimChat = async (chatId: string) => {
    if (!currentUser) return;
    
    try {
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        assignedTo: currentUser.uid, // Marca como meu
        assignedAt: new Date(),
        status: 'open'
      });
      console.log(`Chat ${chatId} assumido por ${currentUser.email}`);
    } catch (error) {
      console.error("Erro ao assumir chat:", error);
    }
  };

  // Função para "Devolver" o cliente pra fila (caso precise)
  const releaseChat = async (chatId: string) => {
    try {
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        assignedTo: null // Volta pra piscina
      });
    } catch (error) {
      console.error("Erro ao liberar chat:", error);
    }
  };

  return { 
    unassignedChats, 
    myChats, 
    claimChat, 
    releaseChat, 
    loading 
  };
};
