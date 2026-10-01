import React, { useState } from 'react';
import { Map, Ship, PackageSearch, Search, X, MapPin } from 'lucide-react';
import PORTS from "./assets/ports.json";
import SHIPS from "./assets/vessels.json";
import GOODS from "./assets/trade_summary.json";

export default function App() {
  const [isOpen, setIsOpen] = useState(false);

  const togglePanel = () => setIsOpen(!isOpen);

  const Section = ({ title, icon: Icon, placeholder, data, renderItem }) => (
    <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
      <div className="flex items-center gap-2 mb-3 text-gray-800 font-semibold">
        <Icon size={18} className="text-blue-500" />
        <h3>{title}</h3>
      </div>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
        />
      </div>

      <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
        {data.map((item) => (
          <div key={item.id} className="p-3 bg-white border border-gray-100 rounded-lg hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all group">
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-800 p-4 sm:p-8">
      {/* Decorative background for the empty state */}
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center text-gray-400">
          <Map className="w-24 h-24 mx-auto mb-4 opacity-20" />
          <p className="text-lg">Dashboard map background goes here.</p>
          <p className="text-sm">Click "Navigation" to plan a new route.</p>
        </div>
      </div>

      {/* Navigation Toggle Button */}
      <button
        onClick={togglePanel}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 font-semibold focus:outline-none focus:ring-4 focus:ring-orange-300"
      >
        <Map size={20} />
        {isOpen ? 'Close Panel' : 'Navigation'}
      </button>

      {/* Floating Panel Overlay */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[450px] bg-white shadow-2xl transition-transform duration-300 ease-in-out transform overflow-y-auto ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } z-40 border-l border-gray-200`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800 tracking-tight">New Navigation</h2>
            <button onClick={togglePanel} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          <form onSubmit={(e) => e.preventDefault()}>
            <Section
              title="Departure Port"
              icon={MapPin}
              placeholder="Search departure city..."
              data={PORTS}
              renderItem={(port) => (
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-gray-700 group-hover:text-blue-600">{port.PORT_NAME}</span>
                  <span className="text-xs text-gray-400 font-mono">{port.LATITUDE};{port.LONGITUDE}</span>
                </div>
              )}
            />

            <Section
              title="Arriving Port"
              icon={MapPin}
              placeholder="Search arriving city..."
              data={PORTS}
              renderItem={(port) => (
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-gray-700 group-hover:text-blue-600">{port.PORT_NAME}</span>
                  <span className="text-xs text-gray-400 font-mono">{port.LATITUDE};{port.LONGITUDE}</span>
                </div>
              )}
            />

            <Section
              title="Select Ship"
              icon={Ship}
              placeholder="Search ship name..."
              data={SHIPS}
              renderItem={(ship) => (
                <div className="flex flex-col text-sm">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-gray-700 group-hover:text-blue-600">{ship.Company_Name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      ship.status === 'Free' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {ship.status}
                    </span>
                  </div>
                  {ship.details && (
                    <span className="text-xs text-gray-500">{ship.details}</span>
                  )}
                </div>
              )}
            />

            <Section
              title="Select Exporting Good"
              icon={PackageSearch}
              placeholder="Search goods..."
              data={GOODS}
              renderItem={(good) => (
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-gray-700 group-hover:text-blue-600">{good.description}</span>
                  {good.bonus && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium border border-purple-200">
                      Bonus: {good.hint}
                    </span>
                  )}
                </div>
              )}
            />

            <div className="mt-8 pb-12">
              <button
                type="button"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md transition-all focus:ring-4 focus:ring-blue-200"
              >
                Start Navigation
              </button>
            </div>
          </form>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
