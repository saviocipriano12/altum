"use client";
import Image from "next/image";
import { motion } from 'framer-motion'
import { Paintbrush, ShieldCheck, Award, Phone, ArrowRight, Star, Mail, MapPin, Facebook, Instagram, Linkedin, CheckCircle, ChevronDown } from 'lucide-react'
import { useState } from 'react'

export default function AJPaintingCleaningPage() {
  const [openFAQ, setOpenFAQ] = useState<number | null>(null)
  const faqs = [
    {
      q: 'Do you provide free estimates?',
      a: 'Yes, we provide free and detailed estimates for all residential, commercial, and industrial projects within 48 hours of your request.'
    },
    {
      q: 'Are you licensed and insured?',
      a: 'Absolutely. We are fully licensed and insured across all New England states, maintaining OSHA and EPA certifications.'
    },
    {
      q: 'Do you handle large industrial projects?',
      a: 'Yes. Our team is equipped and certified for high-volume industrial coatings, facility maintenance, and safety-compliant operations.'
    },
    {
      q: 'What areas do you serve?',
      a: 'We operate across New Hampshire, Massachusetts, and surrounding regions for both residential and commercial clients.'
    }
  ]

  return (
    <div className="bg-white text-gray-900 font-sans overflow-hidden">
      {/* === HEADER & TOPBAR === */}
      <div className="hidden md:flex items-center justify-between px-6 lg:px-10 py-2 bg-blue-900 text-blue-100 text-sm">
        <div className="flex items-center gap-6">
          <span>Emergency 24/7 • Licensed & Insured</span>
          <span>Serving New Hampshire & Greater Boston</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-white">Yelp</a>
          <a href="#" className="hover:text-white">Google Reviews</a>
          <a href="#" className="hover:text-white">BBB</a>
        </div>
      </div>
      <header className="flex justify-between items-center px-6 lg:px-10 py-5 border-b border-gray-100 sticky top-0 bg-white/90 backdrop-blur z-50">
        <div className="flex items-center gap-3">
          <Paintbrush className="text-blue-700" size={30} />
          <h1 className="text-2xl font-extrabold tracking-tight">AJ Painting & Cleaning Corp.</h1>
        </div>
        <nav className="hidden md:flex gap-8 font-medium text-gray-700">
          <a href="#about" className="hover:text-blue-700">About</a>
          <a href="#services" className="hover:text-blue-700">Services</a>
          <a href="#projects" className="hover:text-blue-700">Projects</a>
          <a href="#faq" className="hover:text-blue-700">FAQ</a>
          <a href="#contact" className="hover:text-blue-700">Contact</a>
        </nav>
        <a href="#contact" className="inline-flex items-center gap-2 bg-orange-500 text-white px-5 py-2 rounded-full shadow hover:bg-orange-600">
          <Phone size={16} /> Get Free Estimate
        </a>
      </header>

      {/* === HERO === */}
      <section className="relative min-h-[88vh] flex items-center">
        <div className="absolute inset-0 bg-[url('/cases/ajpainting-hero-industrial.jpg')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 grid lg:grid-cols-2 items-center gap-12 w-full">
          <div>
            <motion.h2 initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{duration:0.7}} className="text-white text-5xl md:text-6xl font-extrabold leading-tight">
              Painting & Cleaning Excellence
              <span className="block text-orange-400">Built for Homes and Industries</span>
            </motion.h2>
            <motion.p initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{duration:0.8, delay:0.1}} className="text-blue-100 text-lg mt-6 max-w-xl">
              Premium service, precision work, and lasting results trusted by thousands of clients across New England.
            </motion.p>
            <div className="flex flex-wrap gap-4 mt-8">
              <a href="#contact" className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-full font-semibold shadow-lg">
                Get Estimate <ArrowRight size={18} />
              </a>
              <a href="#projects" className="inline-flex items-center gap-2 bg-white/10 text-white border border-white/30 hover:bg-white hover:text-blue-800 px-7 py-3 rounded-full font-semibold">
                View Projects
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* === METRICS === */}
      <section className="bg-black text-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[{n:'+10K',l:'Walls Painted'},{n:'+2K',l:'Happy Clients'},{n:'15+',l:'Years Experience'},{n:'98%',l:'Satisfaction Rate'}].map((m,i)=> (
            <motion.div key={i} initial={{opacity:0, y:10}} whileInView={{opacity:1,y:0}} transition={{duration:0.5, delay:i*0.1}} className="bg-white/5 rounded-2xl border border-white/10 p-6 text-center">
              <div className="text-3xl font-extrabold text-orange-400">{m.n}</div>
              <div className="mt-1 text-blue-100">{m.l}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* === ABOUT === */}
      <section id="about" className="max-w-7xl mx-auto px-6 lg:px-10 py-20 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h3 className="text-4xl font-extrabold">Trusted Since 2010</h3>
          <p className="text-gray-600 text-lg mt-5">AJ Painting & Cleaning Corp. provides full‑scale residential, commercial, and industrial services. We stand for quality, transparency, and reliability — combining advanced coating systems with professional cleaning and maintenance solutions.</p>
          <div className="mt-8 grid sm:grid-cols-2 gap-5">
            {[{t:'Licensed & Insured',i:ShieldCheck},{t:'Premium Materials',i:Award},{t:'Expert Supervision',i:Star},{t:'After‑Care Guarantee',i:CheckCircle}].map((it,ix)=> (
              <div key={ix} className="flex items-start gap-3 bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <it.i className="text-blue-700" />
                <div>
                  <div className="font-semibold">{it.t}</div>
                  <div className="text-gray-500 text-sm">Excellence you can measure.</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <Image src="/cases/team-van.jpg" alt="Team" width={1200} height={800} className="rounded-3xl shadow-2xl border border-gray-100 w-full h-[400px] object-cover" />
        </div>
      </section>

      {/* === PROJECTS CAROUSEL === */}
      <section id="projects" className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 text-center">
          <h3 className="text-4xl font-extrabold mb-10">Recent Projects</h3>
          <div className="overflow-x-auto flex gap-8 pb-6 snap-x snap-mandatory">
            {["/cases/res1.jpg","/cases/res2.jpg","/cases/ind1.jpg","/cases/com1.jpg"].map((img,i)=>(
              <motion.div key={i} whileHover={{scale:1.03}} className="min-w-[350px] snap-center bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="h-56 bg-cover bg-center" style={{backgroundImage:`url(${img})`}}></div>
                <div className="p-5 text-left">
                  <h4 className="text-xl font-semibold">Project #{i+1}</h4>
                  <p className="text-gray-600 text-sm mt-1">Before & after transformation with lasting coatings.</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* === LOGO STRIP === */}
      <section className="bg-blue-700 py-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 flex items-center justify-around flex-wrap gap-8 text-white/70 text-sm">
          {['Sherwin‑Williams','Benjamin Moore','Home Depot','Lowe’s','Valspar'].map((brand,i)=>(
            <div key={i} className="uppercase tracking-wider font-semibold opacity-80 hover:opacity-100 transition">{brand}</div>
          ))}
        </div>
      </section>

      {/* === FAQ === */}
      <section id="faq" className="py-20 px-6 lg:px-10 max-w-5xl mx-auto">
        <h3 className="text-4xl font-extrabold text-center mb-12">Frequently Asked Questions</h3>
        <div className="space-y-4">
          {faqs.map((f,i)=>(
            <div key={i} className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <button onClick={()=>setOpenFAQ(openFAQ===i?null:i)} className="w-full flex justify-between items-center px-6 py-4 text-left text-lg font-semibold bg-gray-50 hover:bg-gray-100">
                {f.q}
                <ChevronDown className={`transition-transform ${openFAQ===i?'rotate-180':'rotate-0'}`} />
              </button>
              {openFAQ===i && (
                <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} transition={{duration:0.3}} className="px-6 py-4 text-gray-600 bg-white">
                  {f.a}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* === CONTACT === */}
      <section id="contact" className="relative py-24">
        <div className="absolute inset-0 bg-[url('/cases/texture-brush.jpg')] opacity-10 bg-cover" />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-10 grid lg:grid-cols-2 gap-12 items-stretch">
          <div className="bg-black text-white rounded-3xl p-10 shadow-2xl">
            <h3 className="text-4xl font-extrabold">Get a Free, Fast Estimate</h3>
            <p className="text-blue-100 mt-3">Fill out the form and our project manager will get in touch within 24 hours.</p>
            <form className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input placeholder="First name" className="rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-blue-200 focus:ring-2 focus:ring-orange-400" />
              <input placeholder="Last name" className="rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-blue-200 focus:ring-2 focus:ring-orange-400" />
              <input placeholder="Email" className="sm:col-span-2 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-blue-200 focus:ring-2 focus:ring-orange-400" />
              <input placeholder="Service / Location" className="sm:col-span-2 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-blue-200 focus:ring-2 focus:ring-orange-400" />
              <textarea placeholder="Project details" rows={4} className="sm:col-span-2 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-blue-200 focus:ring-2 focus:ring-orange-400" />
              <button className="sm:col-span-2 inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-semibold">
                Submit Request <ArrowRight size={18} />
              </button>
            </form>
          </div>
          <div className="bg-white rounded-3xl p-10 shadow-xl border border-gray-100">
            <h4 className="text-2xl font-bold">Why Clients Choose AJ</h4>
            <ul className="mt-5 space-y-4 text-gray-700">
              {['Detailed scope & transparent pricing','Premium materials and equipment','Licensed, OSHA & EPA Certified Crews','Daily cleanup and on‑schedule delivery'].map((x, i)=> (
                <li key={i} className="flex items-start gap-3"><CheckCircle className="text-blue-700 mt-1"/><span>{x}</span></li>
              ))}
            </ul>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {["/cases/logo1.png","/cases/logo2.png","/cases/logo3.png"].map((l, i)=> (
                <div key={i} className="h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400">Logo</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* === FOOTER === */}
      <footer className="bg-blue-950 text-blue-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14 grid md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2">
              <Paintbrush className="text-orange-400" />
              <span className="font-bold text-white">AJ Painting & Cleaning Corp.</span>
            </div>
            <p className="mt-4 text-blue-200">Premium painting, coatings and white‑glove cleaning for homes, business and industrial facilities across New England.</p>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Company</div>
            <ul className="space-y-2 text-blue-200">
              <li>About</li>
              <li>Projects</li>
              <li>Careers</li>
              <li>Certifications</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Contact</div>
            <ul className="space-y-2 text-blue-200">
              <li className="flex items-center gap-2"><Mail size={16}/> contact@ajpainting.com</li>
              <li className="flex items-center gap-2"><Phone size={16}/> (603) 555‑0123</li>
              <li className="flex items-center gap-2"><MapPin size={16}/> Manchester, NH</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Follow</div>
            <div className="flex items-center gap-3 text-blue-200">
              <Facebook /> <Instagram /> <Linkedin />
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 text-xs text-blue-300 flex justify-between">
            <span>© {new Date().getFullYear()} AJ Painting & Cleaning Corp. All rights reserved.</span>
            <span>OSHA • EPA Lead‑Safe • Fully Insured</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
